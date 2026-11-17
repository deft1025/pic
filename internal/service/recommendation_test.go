package service

import (
	"context"
	"errors"
	"reflect"
	"testing"

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
	candidates []model.RecommendationCandidate
	user, age  string
	statistics bool
	err        error
}

func (s *recommendationStub) RecommendationCandidates(_ context.Context, user, age string, statistics bool) ([]model.RecommendationCandidate, error) {
	s.user, s.age, s.statistics = user, age, statistics
	return s.candidates, s.err
}
func (s *recommendationStub) List(_ context.Context, q model.Query) ([]model.Book, int, error) {
	s.query = q
	books := []model.Book{}
	for i := len(q.IDs) - 1; i >= 0; i-- {
		books = append(books, model.Book{ID: q.IDs[i], Cover: "/assets/cover.jpg", Pages: []model.Page{{Number: 1}}})
	}
	return books, len(books), nil
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
