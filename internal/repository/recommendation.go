package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"pic/internal/model"
)

type RecommendationStore interface {
	RecommendationCandidates(context.Context, string, string, bool) ([]model.RecommendationCandidate, error)
}

type RecommendationHistoryStore interface {
	RecommendationHistory(context.Context, string) (model.RecommendationRecord, error)
	SaveRecommendation(context.Context, string, model.RecommendationRecord, model.RecommendationRecord) (model.RecommendationRecord, error)
}

func readRecommendation(ctx context.Context, db contentReader, user string) (model.RecommendationRecord, error) {
	var raw []byte
	var date time.Time
	err := db.QueryRowContext(ctx, `SELECT book_ids,recommended_date FROM reader_recommendations WHERE user_id=?`, user).Scan(&raw, &date)
	if errors.Is(err, sql.ErrNoRows) {
		return model.RecommendationRecord{}, nil
	}
	if err != nil {
		return model.RecommendationRecord{}, err
	}
	var record model.RecommendationRecord
	if err = json.Unmarshal(raw, &record.BookIDs); err != nil {
		return record, err
	}
	record.Date = date.Format("2006-01-02")
	return record, nil
}

func (r *MySQL) RecommendationHistory(ctx context.Context, user string) (model.RecommendationRecord, error) {
	return readRecommendation(ctx, r.db, user)
}

// SaveRecommendation lets the first request win the day. A same-day repair can
// replace only the exact batch read by the caller, preserving concurrent winners.
func (r *MySQL) SaveRecommendation(ctx context.Context, user string, next, previous model.RecommendationRecord) (model.RecommendationRecord, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return model.RecommendationRecord{}, err
	}
	defer tx.Rollback()
	var locked string
	if err = tx.QueryRowContext(ctx, `SELECT user_id FROM reader_users WHERE user_id=? FOR UPDATE`, user).Scan(&locked); err != nil {
		return model.RecommendationRecord{}, err
	}
	current, err := readRecommendation(ctx, tx, user)
	if err != nil {
		return model.RecommendationRecord{}, err
	}
	// Also prevents a request spanning midnight from replacing a newer batch.
	if current.Date > next.Date || (current.Date == next.Date &&
		(previous.Date != current.Date || !slices.Equal(previous.BookIDs, current.BookIDs) || slices.Equal(next.BookIDs, current.BookIDs))) {
		return current, nil
	}
	raw, err := json.Marshal(next.BookIDs)
	if err != nil {
		return model.RecommendationRecord{}, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO reader_recommendations (user_id,book_ids,recommended_date) VALUES (?,?,?) ON DUPLICATE KEY UPDATE book_ids=VALUES(book_ids),recommended_date=VALUES(recommended_date)`, user, string(raw), next.Date)
	if err != nil {
		return model.RecommendationRecord{}, err
	}
	if err = tx.Commit(); err != nil {
		return model.RecommendationRecord{}, err
	}
	return next, nil
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
