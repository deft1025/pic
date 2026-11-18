package service

import (
	"context"
	"slices"
	"sort"
	"time"

	"pic/internal/model"
	"pic/internal/repository"
)

const recommendationLimit = 4

// A small discovery allocation keeps new books visible alongside popular books.
func recommend(candidates []model.RecommendationCandidate, personalized bool) []string {
	items := append([]model.RecommendationCandidate{}, candidates...)
	ids := []string{}
	seen := map[string]bool{}
	add := func(filter func(model.RecommendationCandidate) bool, limit int) {
		for _, c := range items {
			if len(ids) >= limit {
				break
			}
			if !seen[c.BookID] && filter(c) {
				ids = append(ids, c.BookID)
				seen[c.BookID] = true
			}
		}
	}
	if personalized {
		sort.Slice(items, func(i, j int) bool { return items[i].Sequence > items[j].Sequence })
		add(func(c model.RecommendationCandidate) bool { return c.AgeMatch && !c.Completed }, 2)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Score != items[j].Score {
			return items[i].Score > items[j].Score
		}
		return items[i].Sequence > items[j].Sequence
	})
	if personalized {
		add(func(c model.RecommendationCandidate) bool { return c.AgeMatch && !c.Completed }, recommendationLimit)
		add(func(c model.RecommendationCandidate) bool { return c.AgeMatch }, recommendationLimit)
	}
	add(func(model.RecommendationCandidate) bool { return true }, recommendationLimit)
	return ids
}

// Exclude the last batch first, then backfill only when fewer than four remain.
func recommendAvoiding(candidates []model.RecommendationCandidate, personalized bool, previous []string) []string {
	excluded := map[string]bool{}
	for _, id := range previous {
		excluded[id] = true
	}
	fresh := []model.RecommendationCandidate{}
	for _, c := range candidates {
		if !excluded[c.BookID] {
			fresh = append(fresh, c)
		}
	}
	ids := recommend(fresh, personalized)
	for _, id := range recommend(candidates, personalized) {
		if len(ids) >= recommendationLimit {
			break
		}
		if !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	return ids
}

func recommendationUnavailable(err error) error {
	return &Error{Kind: ErrUnavailable, Message: "暂时无法推荐绘本，请稍后重试", Cause: err}
}

func (s *Library) Recommendations(ctx context.Context, accounts *Accounts, token string) (BookList, error) {
	return s.recommendations(ctx, accounts, token, time.Now())
}

func (s *Library) recommendations(ctx context.Context, accounts *Accounts, token string, now time.Time) (BookList, error) {
	user, age := "", ""
	if accounts != nil && token != "" {
		var err error
		user, err = accounts.Authenticate(ctx, token)
		if err != nil {
			return BookList{}, err
		}
		profile, err := accounts.Profile(ctx, user)
		if err != nil {
			return BookList{}, err
		}
		age = profile.Age
	}
	today := now.In(time.FixedZone("Asia/Shanghai", 8*60*60)).Format("2006-01-02")
	var history repository.RecommendationHistoryStore
	var previous model.RecommendationRecord
	if user != "" {
		var ok bool
		history, ok = s.store.(repository.RecommendationHistoryStore)
		if !ok {
			return BookList{}, recommendationUnavailable(nil)
		}
		var err error
		previous, err = history.RecommendationHistory(ctx, user)
		if err != nil {
			return BookList{}, recommendationUnavailable(err)
		}
		if previous.Date >= today {
			return s.recommendationBooks(ctx, previous.BookIDs)
		}
	}
	store, ok := s.store.(repository.RecommendationStore)
	if !ok {
		return BookList{}, recommendationUnavailable(nil)
	}
	candidates, err := store.RecommendationCandidates(ctx, user, age, accounts != nil)
	if err != nil {
		return BookList{}, recommendationUnavailable(err)
	}
	ids := recommendAvoiding(candidates, age != "", previous.BookIDs)
	result, err := s.recommendationBooks(ctx, ids)
	if err != nil {
		return BookList{}, err
	}
	if history != nil && len(result.Items) > 0 {
		// Only save after the actual cards have been loaded successfully.
		next := model.RecommendationRecord{Date: today, BookIDs: []string{}}
		for _, book := range result.Items {
			next.BookIDs = append(next.BookIDs, book.ID)
		}
		saved, err := history.SaveRecommendation(ctx, user, next)
		if err != nil {
			return BookList{}, recommendationUnavailable(err)
		}
		if !slices.Equal(saved.BookIDs, next.BookIDs) {
			return s.recommendationBooks(ctx, saved.BookIDs)
		}
	}
	return result, nil
}

func (s *Library) recommendationBooks(ctx context.Context, ids []string) (BookList, error) {
	// A non-nil empty slice must never turn into an unfiltered library query.
	if ids == nil {
		ids = []string{}
	}
	result, err := s.List(ctx, model.Query{IDs: ids, Limit: recommendationLimit})
	if err != nil {
		return BookList{}, err
	}
	byID := map[string]model.Book{}
	for _, book := range result.Items {
		byID[book.ID] = book
	}
	result.Items = []model.Book{}
	for _, id := range ids {
		if book, exists := byID[id]; exists {
			result.Items = append(result.Items, book)
			delete(byID, id)
			if len(result.Items) >= recommendationLimit {
				break
			}
		}
	}
	result.Total = len(result.Items)
	return result, nil
}
