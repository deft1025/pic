package service

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"pic/internal/model"
)

func TestRecommendationRanking(t *testing.T) {
	items := []model.RecommendationCandidate{
		{BookID: "newest", Sequence: 10, AgeMatch: true},
		{BookID: "new", Sequence: 9, AgeMatch: true},
		{BookID: "popular", Sequence: 5, Score: 7, AgeMatch: true},
		{BookID: "tie-newer", Sequence: 4, Score: 6, AgeMatch: true},
		{BookID: "tie-older", Sequence: 3, Score: 6, AgeMatch: true},
		{BookID: "completed", Sequence: 12, Score: 20, AgeMatch: true, Completed: true},
		{BookID: "other-age", Sequence: 11, Score: 30},
	}
	for _, tc := range []struct {
		name         string
		items        []model.RecommendationCandidate
		personalized bool
		want         []string
	}{
		{"guest popularity and ID tie", items, false, []string{"other-age", "completed", "popular", "tie-newer"}},
		{"age unread discovery and popular", items, true, []string{"newest", "new", "popular", "tie-newer"}},
		{"unread exhausted", items[5:], true, []string{"completed", "other-age"}},
		{"zero statistics", []model.RecommendationCandidate{{BookID: "old", Sequence: 1}, {BookID: "new", Sequence: 2}}, false, []string{"new", "old"}},
		{"empty", nil, false, []string{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := recommend(tc.items, tc.personalized); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

type recommendationStub struct {
	storeStub
	candidates                          []model.RecommendationCandidate
	user, age                           string
	statistics                          bool
	err                                 error
	history                             model.RecommendationRecord
	historyReads, saves, candidateCalls int
	historyErr, saveErr, listErr        error
	winner                              *model.RecommendationRecord
}

func (s *recommendationStub) RecommendationHistory(context.Context, string) (model.RecommendationRecord, error) {
	s.historyReads++
	return s.history, s.historyErr
}
func (s *recommendationStub) SaveRecommendation(_ context.Context, _ string, next, previous model.RecommendationRecord) (model.RecommendationRecord, error) {
	s.saves++
	if s.saveErr != nil {
		return model.RecommendationRecord{}, s.saveErr
	}
	if s.winner != nil {
		s.history = *s.winner
		s.winner = nil
		return s.history, nil
	}
	if s.history.Date > next.Date || (s.history.Date == next.Date && (previous.Date != s.history.Date || !reflect.DeepEqual(previous.BookIDs, s.history.BookIDs))) {
		return s.history, nil
	}
	s.history = next
	return next, nil
}

func (s *recommendationStub) RecommendationCandidates(_ context.Context, user, age string, statistics bool) ([]model.RecommendationCandidate, error) {
	s.user, s.age, s.statistics = user, age, statistics
	s.candidateCalls++
	return s.candidates, s.err
}
func (s *recommendationStub) List(_ context.Context, q model.Query) ([]model.Book, int, error) {
	s.query = q
	if s.listErr != nil {
		return nil, 0, s.listErr
	}
	books := []model.Book{}
	for i := len(q.IDs) - 1; i >= 0; i-- {
		books = append(books, model.Book{ID: q.IDs[i], Cover: "/assets/cover.jpg", Pages: []model.Page{{Number: 1}}})
	}
	return books, len(books), nil
}

func TestRecommendationRotationAndDailyReuse(t *testing.T) {
	ctx, accounts, _, _ := accountService()
	session, err := accounts.Login(ctx, "code")
	if err != nil {
		t.Fatal(err)
	}
	store := &recommendationStub{}
	for i, id := range []string{"a", "b", "c", "d", "e", "f", "g", "h"} {
		store.candidates = append(store.candidates, model.RecommendationCandidate{BookID: id, Sequence: uint64(8 - i), AgeMatch: true})
	}
	library := NewLibrary(store, "")
	now := time.Date(2026, 11, 17, 15, 59, 0, 0, time.UTC) // 23:59 Beijing
	result, err := library.recommendations(ctx, accounts, session.Token, now)
	if err != nil || store.history.Date != "2026-11-17" || !reflect.DeepEqual(store.history.BookIDs, []string{"a", "b", "c", "d"}) {
		t.Fatal("initial recommendation not saved", result, err, store.history)
	}
	store.candidates[7].Score = 1000
	if _, err = library.recommendations(ctx, accounts, session.Token, now); err != nil || store.saves != 1 || store.candidateCalls != 1 {
		t.Fatal("same-day request changed the batch", err)
	}
	if _, err = library.recommendations(ctx, accounts, session.Token, now.Add(time.Minute)); err != nil || store.history.Date != "2026-11-18" || !reflect.DeepEqual(store.history.BookIDs, []string{"e", "f", "h", "g"}) {
		t.Fatal("Beijing midnight did not exclude last batch", err, store.history)
	}
	if _, err = library.recommendations(ctx, accounts, session.Token, now.AddDate(0, 0, 8)); err != nil || !reflect.DeepEqual(store.history.BookIDs, []string{"a", "b", "c", "d"}) {
		t.Fatal("return after multiple days did not exclude last batch", err, store.history)
	}
	if store.saves != 3 {
		t.Fatal("unexpected history writes", store.saves)
	}
}

func TestRecommendationExclusionBackfillAndFailures(t *testing.T) {
	candidates := []model.RecommendationCandidate{{BookID: "a", Sequence: 3}, {BookID: "b", Sequence: 2}, {BookID: "c", Sequence: 1}}
	if got := recommendAvoiding(candidates, false, []string{"a", "b"}); !reflect.DeepEqual(got, []string{"c", "a", "b"}) {
		t.Fatal("insufficient fresh books not backfilled", got)
	}
	ctx, accounts, _, _ := accountService()
	session, err := accounts.Login(ctx, "code")
	if err != nil {
		t.Fatal(err)
	}
	old := model.RecommendationRecord{Date: "2026-11-01", BookIDs: []string{"a"}}
	for _, failure := range []string{"history", "cards", "save", "empty"} {
		t.Run(failure, func(t *testing.T) {
			store := &recommendationStub{history: old, candidates: candidates}
			switch failure {
			case "history":
				store.historyErr = errors.New("private SQL")
			case "cards":
				store.listErr = errors.New("card failure")
			case "save":
				store.saveErr = errors.New("private SQL")
			case "empty":
				store.candidates = nil
			}
			_, err := NewLibrary(store, "").recommendations(ctx, accounts, session.Token, time.Now())
			if failure != "empty" && !errors.Is(err, ErrUnavailable) {
				t.Fatal("failure ignored", err)
			}
			if failure == "empty" && err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(store.history, old) || (failure != "save" && store.saves != 0) {
				t.Fatal("failed generation replaced previous record", store.history)
			}
		})
	}
	store := &recommendationStub{candidates: candidates, historyErr: errors.New("history must not be read")}
	library := NewLibrary(store, "")
	for _, account := range []*Accounts{nil, accounts} {
		if _, err = library.Recommendations(ctx, account, ""); err != nil {
			t.Fatal("guest accessed history", err)
		}
	}
	if store.historyReads != 0 || store.saves != 0 {
		t.Fatal("guest history persisted")
	}
	store.historyErr = nil
	store.winner = &model.RecommendationRecord{Date: time.Now().In(time.FixedZone("Beijing", 8*3600)).Format("2006-01-02"), BookIDs: []string{"c"}}
	result, err := library.Recommendations(ctx, accounts, session.Token)
	if err != nil || len(result.Items) != 1 || result.Items[0].ID != "c" {
		t.Fatal("concurrent winner was not returned", result, err)
	}
}

func TestRecommendationsUseServerProfileAndKeepRankingAndPortableAssets(t *testing.T) {
	ctx, accounts, _, _ := accountService()
	session, err := accounts.Login(ctx, "test-code")
	if err != nil {
		t.Fatal(err)
	}
	store := &recommendationStub{candidates: []model.RecommendationCandidate{{BookID: "old", Sequence: 1}, {BookID: "new", Sequence: 2}}}
	library := NewLibrary(store, "https://media.example.com")
	for _, tc := range []struct {
		accounts         *Accounts
		token, user, age string
		stats            bool
	}{
		{nil, "", "", "", false},
		{accounts, "", "", "", true},
		{accounts, session.Token, session.User.ID, "3-4", true},
	} {
		result, err := library.Recommendations(ctx, tc.accounts, tc.token)
		if err != nil {
			t.Fatal(err)
		}
		if store.user != tc.user || store.age != tc.age || store.statistics != tc.stats {
			t.Fatal("incorrect recommendation scope")
		}
		if len(result.Items) != 2 || result.Items[0].ID != "new" || result.Items[0].Cover != "https://media.example.com/assets/cover.jpg" || result.Items[0].Pages != nil {
			t.Fatal("ranking or list payload changed", result)
		}
	}
	if _, err := library.Recommendations(ctx, accounts, "bad-token"); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("invalid session accepted", err)
	}
	store.err = errors.New("database unavailable")
	if _, err := library.Recommendations(context.Background(), nil, ""); !errors.Is(err, ErrUnavailable) {
		t.Fatal("database failure silently ignored", err)
	}
}

func TestRecommendationsExcludeFavoritesAndRepairOnlyAffectedDailyCards(t *testing.T) {
	ctx, accounts, account, _ := accountService()
	session, err := accounts.Login(ctx, "code")
	if err != nil {
		t.Fatal(err)
	}
	store := &recommendationStub{}
	for i, id := range []string{"a", "b", "c", "d", "e", "f"} {
		store.candidates = append(store.candidates, model.RecommendationCandidate{BookID: id, Sequence: uint64(6 - i), AgeMatch: true})
	}
	library := NewLibrary(store, "")
	now := time.Date(2026, 11, 20, 1, 0, 0, 0, time.UTC)
	account.ids = []string{"a"}
	ids := func() []string {
		t.Helper()
		result, err := library.recommendations(ctx, accounts, session.Token, now)
		if err != nil {
			t.Fatal(err)
		}
		ids := []string{}
		for _, book := range result.Items {
			ids = append(ids, book.ID)
		}
		return ids
	}
	if got := ids(); !reflect.DeepEqual(got, []string{"b", "c", "d", "e"}) {
		t.Fatal("initial ranking included a favorite", got)
	}
	account.ids = []string{"a", "c"}
	if got := ids(); !reflect.DeepEqual(got, []string{"b", "f", "d", "e"}) {
		t.Fatal("same-day repair moved unaffected cards or failed to fill the slot", got)
	}
	if store.history.Date != "2026-11-20" || store.saves != 2 {
		t.Fatal("same-day repair was not persisted", store.history, store.saves)
	}
	if got := ids(); !reflect.DeepEqual(got, store.history.BookIDs) || store.saves != 2 || store.candidateCalls != 2 {
		t.Fatal("valid repaired batch was regenerated", got)
	}
	account.ids = []string{"a", "b", "c", "d", "e", "f"}
	if got := ids(); len(got) != 0 || len(store.history.BookIDs) != 0 || store.saves != 3 {
		t.Fatal("exhausted pool backfilled favorites or retained invalid cache", got, store.history)
	}
}

func TestRecommendationFavoriteExclusionSurvivesFallbackAndFailure(t *testing.T) {
	for _, age := range []string{"3-4", ""} {
		t.Run("age="+age, func(t *testing.T) {
			ctx, accounts, account, _ := accountService()
			account.profile.Age = age
			session, err := accounts.Login(ctx, "code")
			if err != nil {
				t.Fatal(err)
			}
			account.ids = []string{"favorite"}
			store := &recommendationStub{candidates: []model.RecommendationCandidate{
				{BookID: "favorite", Sequence: 10, Score: 100, AgeMatch: true},
				{BookID: "completed", Sequence: 2, Completed: true, AgeMatch: true},
				{BookID: "other-age", Sequence: 1},
			}}
			library := NewLibrary(store, "")
			now := time.Date(2026, 11, 20, 1, 0, 0, 0, time.UTC)
			result, err := library.recommendations(ctx, accounts, session.Token, now)
			if err != nil || len(result.Items) != 2 || result.Items[0].ID != "completed" || result.Items[1].ID != "other-age" {
				t.Fatal("fallback included favorites or failed to use other candidates", result, err)
			}
			old := store.history
			account.ids = []string{"favorite", "completed"}
			store.err = errors.New("candidate failure")
			if _, err = library.recommendations(ctx, accounts, session.Token, now); !errors.Is(err, ErrUnavailable) || !reflect.DeepEqual(store.history, old) {
				t.Fatal("failed repair overwrote the daily record", err, store.history)
			}
			store.err = nil
			store.saveErr = errors.New("save failure")
			if _, err = library.recommendations(ctx, accounts, session.Token, now); !errors.Is(err, ErrUnavailable) || !reflect.DeepEqual(store.history, old) {
				t.Fatal("failed persistence overwrote the daily record", err, store.history)
			}
			store.saveErr = nil
			store.winner = &model.RecommendationRecord{Date: now.Format("2006-01-02"), BookIDs: []string{"favorite", "other-age"}}
			result, err = library.recommendations(ctx, accounts, session.Token, now)
			if err != nil || len(result.Items) != 1 || result.Items[0].ID != "other-age" {
				t.Fatal("concurrent winner exposed a known favorite", result, err)
			}
		})
	}
}

func TestConcurrentDailyWinnerWithFavoritesIsReplacedWithoutLeavingAGap(t *testing.T) {
	ctx, accounts, account, _ := accountService()
	session, err := accounts.Login(ctx, "code")
	if err != nil {
		t.Fatal(err)
	}
	account.ids = []string{"a", "b"}
	store := &recommendationStub{winner: &model.RecommendationRecord{Date: "2026-11-20", BookIDs: []string{"a", "c", "d", "e"}}}
	for i, id := range []string{"a", "b", "c", "d", "e", "f"} {
		store.candidates = append(store.candidates, model.RecommendationCandidate{BookID: id, Sequence: uint64(6 - i), AgeMatch: true})
	}
	result, err := NewLibrary(store, "").recommendations(ctx, accounts, session.Token, time.Date(2026, 11, 20, 1, 0, 0, 0, time.UTC))
	if err != nil || len(result.Items) != 4 || !reflect.DeepEqual(store.history.BookIDs, []string{"f", "c", "d", "e"}) {
		t.Fatal("concurrent batch retained a favorite or left a gap", result, err, store.history)
	}
}
