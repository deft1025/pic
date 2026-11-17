package repository

import (
	"context"

	"pic/internal/model"
)

type RecommendationStore interface {
	RecommendationCandidates(context.Context, string, string, bool) ([]model.RecommendationCandidate, error)
}

func (r *MySQL) RecommendationCandidates(ctx context.Context, user, age string, statistics bool) ([]model.RecommendationCandidate, error) {
	// Disabled accounts do not require the optional reader tables to exist.
	columns := "b.book_id,b.id,0,0,0"
	args := []any{}
	if statistics {
		if user == "" {
			user = "0"
		}
		// Separate indexed counts avoid multiplying reading states by favorite rows.
		columns = `b.book_id,b.id,
 (SELECT COUNT(*) FROM reader_favorites f WHERE f.book_id=b.book_id AND f.active=1)*2
 +(SELECT COUNT(*) FROM reader_events e WHERE e.book_id=b.book_id AND e.event_kind='complete'),
 EXISTS (SELECT 1 FROM book_age_ranges a WHERE a.book_id=b.book_id AND a.age_id=?),
 EXISTS (SELECT 1 FROM reader_events e WHERE e.book_id=b.book_id AND e.user_id=? AND e.event_kind='complete')`
		args = append(args, age, user)
	}
	rows, err := r.db.QueryContext(ctx, "SELECT "+columns+" FROM books b JOIN book_licenses l ON l.book_id=b.book_id WHERE "+r.visibility(), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []model.RecommendationCandidate{}
	for rows.Next() {
		var item model.RecommendationCandidate
		if err = rows.Scan(&item.BookID, &item.Sequence, &item.Score, &item.AgeMatch, &item.Completed); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
