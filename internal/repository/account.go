package repository

import (
	"context"
	"database/sql"
	"time"

	"pic/internal/model"
)

// AccountStore keeps identity and reader state separate from catalog maintenance.
type AccountStore interface {
	Login(context.Context, string, string, time.Time) (model.Account, error)
	Profile(context.Context, string) (model.Account, error)
	SaveProfile(context.Context, string, string, string) error
	Authenticate(context.Context, string, time.Time) (string, error)
	Logout(context.Context, string) error
	Favorites(context.Context, string) ([]string, error)
	CompletedBooks(context.Context, string) ([]string, error)
	SetFavorites(context.Context, string, []string, bool) error
	RecordEvent(context.Context, model.ReadingEvent) error
}

func (s *MySQL) Login(ctx context.Context, openID, hash string, expires time.Time) (model.Account, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return model.Account{}, err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO reader_users (wechat_open_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id=user_id`, openID)
	if err != nil {
		return model.Account{}, err
	}
	var account model.Account
	if err = tx.QueryRowContext(ctx, `SELECT user_id,name,age FROM reader_users WHERE wechat_open_id=?`, openID).Scan(&account.ID, &account.Name, &account.Age); err != nil {
		return account, err
	}
	// Remove this account’s expired sessions at login.
	if _, err = tx.ExecContext(ctx, `DELETE FROM reader_sessions WHERE user_id=? AND expires_at<=UTC_TIMESTAMP(3)`, account.ID); err != nil {
		return account, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO reader_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)`, hash, account.ID, expires); err != nil {
		return account, err
	}
	return account, tx.Commit()
}
func (s *MySQL) Profile(ctx context.Context, user string) (model.Account, error) {
	var account model.Account
	err := s.db.QueryRowContext(ctx, `SELECT user_id,name,age FROM reader_users WHERE user_id=?`, user).Scan(&account.ID, &account.Name, &account.Age)
	return account, err
}
func (s *MySQL) SaveProfile(ctx context.Context, user, name, age string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE reader_users SET name=?,age=? WHERE user_id=?`, name, age, user)
	return err
}
func (s *MySQL) Authenticate(ctx context.Context, hash string, now time.Time) (string, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `SELECT user_id FROM reader_sessions WHERE token_hash=? AND expires_at>?`, hash, now).Scan(&id)
	return id, err
}
func (s *MySQL) Logout(ctx context.Context, hash string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM reader_sessions WHERE token_hash=?`, hash)
	return err
}
func (s *MySQL) Favorites(ctx context.Context, user string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT f.book_id FROM reader_favorites f JOIN books b ON b.book_id=f.book_id WHERE f.user_id=? AND f.active=1 AND b.publish_status='published' ORDER BY f.updated_at DESC,f.id DESC`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		items = append(items, id)
	}
	return items, rows.Err()
}

// CompletedBooks derives the account's finished books from its existing reading state.
func (s *MySQL) CompletedBooks(ctx context.Context, user string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT e.book_id FROM reader_events e JOIN books b ON b.book_id=e.book_id WHERE e.user_id=? AND e.event_kind='complete' AND b.publish_status='published' ORDER BY e.id DESC`, user)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		items = append(items, id)
	}
	return items, rows.Err()
}

func (s *MySQL) SetFavorites(ctx context.Context, user string, ids []string, active bool) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Lock the parent row to serialize concurrent favorite changes.
	var locked string
	if err = tx.QueryRowContext(ctx, `SELECT user_id FROM reader_users WHERE user_id=? FOR UPDATE`, user).Scan(&locked); err != nil {
		return err
	}
	for _, id := range ids {
		var old int
		err = tx.QueryRowContext(ctx, `SELECT active FROM reader_favorites WHERE user_id=? AND book_id=?`, user, id).Scan(&old)
		if err != nil && err != sql.ErrNoRows {
			return err
		}
		value := 0
		if active {
			value = 1
		}
		if old == value {
			continue
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO reader_favorites (user_id,book_id,active) VALUES (?,?,?) ON DUPLICATE KEY UPDATE active=VALUES(active)`, user, id, value)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

// RecordEvent stores one monotonic reading state per account and book.
func (s *MySQL) RecordEvent(ctx context.Context, e model.ReadingEvent) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	// Serialize opens and completions across devices, including the first insert.
	var user string
	if err = tx.QueryRowContext(ctx, `SELECT user_id FROM reader_users WHERE user_id=? FOR UPDATE`, e.UserID).Scan(&user); err != nil {
		return err
	}
	var id uint64
	var kind string
	err = tx.QueryRowContext(ctx, `SELECT id,event_kind FROM reader_events WHERE user_id=? AND book_id=? FOR UPDATE`, e.UserID, e.BookID).Scan(&id, &kind)
	if err == sql.ErrNoRows {
		_, err = tx.ExecContext(ctx, `INSERT INTO reader_events (event_id,user_id,book_id,event_kind,reading_id) VALUES (?,?,?,?,?)`, e.ID, e.UserID, e.BookID, e.Kind, e.ReadingID)
	} else if err == nil {
		// A repeated open or any request after completion leaves every field intact.
		if kind == "complete" || e.Kind == "open" {
			return nil
		}
		_, err = tx.ExecContext(ctx, `UPDATE reader_events SET event_id=?,event_kind='complete',reading_id=? WHERE id=?`, e.ID, e.ReadingID, id)
	}
	if err != nil {
		return err
	}
	return tx.Commit()
}
