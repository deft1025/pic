package service

import (
	"context"
	"sort"

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

func (s *Library) Recommendations(ctx context.Context, accounts *Accounts, token string) (BookList, error) {
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
	store, ok := s.store.(repository.RecommendationStore)
	if !ok {
		return BookList{}, &Error{Kind: ErrUnavailable, Message: "暂时无法推荐绘本，请稍后重试"}
	}
	candidates, err := store.RecommendationCandidates(ctx, user, age, accounts != nil)
	if err != nil {
		return BookList{}, &Error{Kind: ErrUnavailable, Message: "暂时无法推荐绘本，请稍后重试", Cause: err}
	}
	ids := recommend(candidates, age != "")
	result, err := s.List(ctx, model.Query{IDs: ids, Limit: recommendationLimit})
	if err != nil {
		return BookList{}, err
	}
	byID := map[string]model.Book{}
	for _, b := range result.Items {
		byID[b.ID] = b
	}
	result.Items = []model.Book{}
	for _, id := range ids {
		if b, exists := byID[id]; exists {
			result.Items = append(result.Items, b)
		}
	}
	result.Total = len(result.Items)
	return result, nil
}
