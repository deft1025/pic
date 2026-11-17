package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"pic/internal/catalog"
	"pic/internal/config"
	"pic/internal/database"
	"pic/internal/model"
)

// Explicitly opt in. Only a unique disposable database is created/dropped;
// the configured content database is never initialized or migrated.
func TestAccountMySQLIntegration(t *testing.T) {
	if os.Getenv("PIC_MYSQL_TEST") != "1" {
		t.Skip("set PIC_MYSQL_TEST=1 for an isolated temporary MySQL database")
	}
	cfg, err := config.Load("../../.env")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	dbc := cfg.Database
	dbc.Name = ""
	admin, err := database.Open(ctx, dbc)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	name := fmt.Sprintf("pic_account_test_%d", time.Now().UnixNano())
	if _, err = admin.ExecContext(ctx, "CREATE DATABASE `"+name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); err != nil {
		t.Fatal("cannot create temporary test database")
	}
	defer func() {
		cleanup, c := context.WithTimeout(context.Background(), 10*time.Second)
		defer c()
		if _, e := admin.ExecContext(cleanup, "DROP DATABASE `"+name+"`"); e != nil {
			t.Error("cannot remove temporary test database")
		}
	}()
	dbc.Name = name
	db, err := database.Open(ctx, dbc)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = database.Initialize(ctx, db, "../../docs/schema.sql"); err != nil {
		t.Fatal(err)
	}
	fixture, err := catalog.Load("../../tests/fixtures/books", "../../tests/fixtures/web", false)
	if err != nil {
		t.Fatal(err)
	}
	repo := New(db, false)
	if err = repo.Import(ctx, fixture.Books); err != nil {
		t.Fatal(err)
	}
	book := fixture.Books[0]
	a, err := repo.Login(ctx, "openid", strings.Repeat("a", 64), time.Now().UTC().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if a.ID != "10000" || a.Name != "" || a.Age != "" {
		t.Fatal("user ID must start at 10000 and profile must be unset")
	}
	if err = repo.SaveProfile(ctx, a.ID, "小读者", "3-4"); err != nil {
		t.Fatal(err)
	}
	profile, err := repo.Profile(ctx, a.ID)
	if err != nil || profile.Name != "小读者" || profile.Age != "3-4" {
		t.Fatal("profile did not roundtrip", err)
	}
	again, err := repo.Login(ctx, "openid", strings.Repeat("b", 64), time.Now().UTC().Add(time.Hour))
	if err != nil || again.ID != a.ID || again.Name != "小读者" || again.Age != "3-4" {
		t.Fatal("wechat identity duplicated", err)
	}
	other, err := repo.Login(ctx, "other-openid", strings.Repeat("c", 64), time.Now().UTC().Add(-time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if other.ID == a.ID {
		t.Fatal("different user IDs must be unique")
	}
	if _, err = repo.Authenticate(ctx, strings.Repeat("c", 64), time.Now().UTC()); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("expired token accepted")
	}
	var wg sync.WaitGroup
	errs := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- repo.SetFavorites(ctx, a.ID, []string{book.ID}, true) }()
	}
	wg.Wait()
	close(errs)
	for err = range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	var count, active int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE(SUM(active),0) FROM reader_favorites WHERE user_id=? AND book_id=?`, a.ID, book.ID).Scan(&count, &active); err != nil || active != 1 || count != 1 {
		t.Fatal("retry/concurrent favorite duplicated state", err, active, count)
	}
	if ids, e := repo.Favorites(ctx, other.ID); e != nil || len(ids) != 0 {
		t.Fatal("cross-account favorites leaked", e)
	}
	if err = repo.SetFavorites(ctx, a.ID, []string{book.ID}, false); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, `SELECT active FROM reader_favorites WHERE user_id=? AND book_id=?`, a.ID, book.ID).Scan(&active); err != nil || active != 0 {
		t.Fatal("cancel did not clear favorite state", err)
	}
	for i := 0; i < 3; i++ {
		if err = repo.SetFavorites(ctx, a.ID, []string{book.ID}, true); err != nil {
			t.Fatal(err)
		}
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*),SUM(active) FROM reader_favorites WHERE user_id=? AND book_id=?`, a.ID, book.ID).Scan(&count, &active); err != nil || count != 1 || active != 1 {
		t.Fatal("refavorite should contribute at most one favorite", err)
	}
	if err = repo.SetFavorites(ctx, other.ID, []string{book.ID}, true); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRowContext(ctx, `SELECT SUM(active) FROM reader_favorites WHERE book_id=?`, book.ID).Scan(&count); err != nil || count != 2 {
		t.Fatal("favorite ranking must count distinct account states", err)
	}
	// A failure after the first insert must roll back the entire batch.
	longID := strings.Repeat("x", 65)
	if err = repo.SetFavorites(ctx, a.ID, []string{"rollback-book", longID}, true); err == nil {
		t.Fatal("expected database validation failure")
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM reader_favorites WHERE book_id='rollback-book'`).Scan(&count); err != nil || count != 0 {
		t.Fatal("partial batch committed", err)
	}
	// Every account/book has a single row: repeated opens do not touch it.
	type readingState struct {
		id                       uint64
		eventID, kind, readingID string
		created, updated         time.Time
	}
	snapshot := func() readingState {
		t.Helper()
		var row readingState
		if err := db.QueryRowContext(ctx, `SELECT id,event_id,event_kind,reading_id,created_at,updated_at FROM reader_events WHERE user_id=? AND book_id=?`, a.ID, book.ID).Scan(&row.id, &row.eventID, &row.kind, &row.readingID, &row.created, &row.updated); err != nil {
			t.Fatal(err)
		}
		return row
	}
	open := model.ReadingEvent{ID: strings.Repeat("1", 32), ReadingID: strings.Repeat("2", 32), BookID: book.ID, Kind: "open", UserID: a.ID}
	if err = repo.RecordEvent(ctx, open); err != nil {
		t.Fatal(err)
	}
	if _, err = db.ExecContext(ctx, `UPDATE reader_events SET updated_at='2020-01-01 00:00:00' WHERE user_id=? AND book_id=?`, a.ID, book.ID); err != nil {
		t.Fatal(err)
	}
	firstOpen := snapshot()
	for i := 0; i < 3; i++ {
		later := open
		later.ID = fmt.Sprintf("%032x", i+10)
		later.ReadingID = fmt.Sprintf("%032x", i+20)
		if err = repo.RecordEvent(ctx, later); err != nil {
			t.Fatal(err)
		}
	}
	if snapshot() != firstOpen {
		t.Fatal("repeated opens changed the first open row")
	}
	e := model.ReadingEvent{ID: strings.Repeat("a", 32), ReadingID: strings.Repeat("c", 32), BookID: book.ID, Kind: "complete", UserID: a.ID}
	if err = repo.RecordEvent(ctx, e); err != nil {
		t.Fatal(err)
	}
	complete := snapshot()
	if complete.id != firstOpen.id || !complete.created.Equal(firstOpen.created) || complete.kind != "complete" || complete.eventID != e.ID || complete.readingID != e.ReadingID || complete.updated.Year() == 2020 {
		t.Fatal("open was not promoted in place to complete")
	}
	if _, err = db.ExecContext(ctx, `UPDATE reader_events SET updated_at='2020-01-01 00:00:00' WHERE user_id=? AND book_id=?`, a.ID, book.ID); err != nil {
		t.Fatal(err)
	}
	firstComplete := snapshot()
	// Opens and completions from concurrent devices preserve the entire completed row.
	completionErrors := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			later := e
			later.ID = fmt.Sprintf("%032x", i+100)
			later.ReadingID = fmt.Sprintf("%032x", i+200)
			if i%2 == 0 {
				later.Kind = "open"
			}
			completionErrors <- repo.RecordEvent(ctx, later)
		}(i)
	}
	wg.Wait()
	close(completionErrors)
	for err = range completionErrors {
		if err != nil {
			t.Fatal(err)
		}
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM reader_events WHERE user_id=? AND book_id=?`, a.ID, book.ID).Scan(&count); err != nil || count != 1 || snapshot() != firstComplete {
		t.Fatal("completed state was duplicated or modified", err)
	}
	// A completion may arrive before an open (offline queue or direct reader entry).
	// Concurrent first requests still create exactly one permanent completed row.
	initialErrors := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			initial := e
			initial.UserID = other.ID
			initial.BookID = "direct-reader-book"
			initial.ID = fmt.Sprintf("%032x", i+300)
			initial.ReadingID = fmt.Sprintf("%032x", i+400)
			if i%2 == 0 {
				initial.Kind = "open"
			}
			initialErrors <- repo.RecordEvent(ctx, initial)
		}(i)
	}
	wg.Wait()
	close(initialErrors)
	for err = range initialErrors {
		if err != nil {
			t.Fatal(err)
		}
	}
	var kind string
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*),MIN(event_kind) FROM reader_events WHERE user_id=? AND book_id='direct-reader-book'`, other.ID).Scan(&count, &kind); err != nil || count != 1 || kind != "complete" {
		t.Fatal("concurrent first opens/completions lost state", err)
	}
	candidates, err := repo.RecommendationCandidates(ctx, a.ID, book.Ages[0], true)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, c := range candidates {
		if c.BookID == book.ID {
			found = true
			if c.Score != 5 || !c.Completed || !c.AgeMatch {
				t.Fatal("expected two favorites and one unique completion", c)
			}
		}
	}
	if !found {
		t.Fatal("published book missing from recommendation candidates")
	}
	// The database also prevents duplicate account/book states from other writers.
	if _, err = db.ExecContext(ctx, `INSERT INTO reader_events(event_id,user_id,book_id,event_kind,reading_id) VALUES(?,?,?,'complete',?)`, strings.Repeat("e", 32), a.ID, book.ID, strings.Repeat("f", 32)); err == nil {
		t.Fatal("duplicate account/book accepted by database")
	}
	candidates, err = repo.RecommendationCandidates(ctx, "", "", true)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range candidates {
		if c.Completed || c.AgeMatch {
			t.Fatal("guest received private read status", c)
		}
		if c.BookID == book.ID && c.Score != 5 {
			t.Fatal("duplicate attempt inflated score", c)
		}
	}
	candidates, err = repo.RecommendationCandidates(ctx, "", "", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range candidates {
		if c.Score != 0 || c.Completed || c.AgeMatch {
			t.Fatal("disabled statistics touched account data", c)
		}
	}
	if err = repo.Logout(ctx, strings.Repeat("a", 64)); err != nil {
		t.Fatal(err)
	}
	if _, err = repo.Authenticate(ctx, strings.Repeat("a", 64), time.Now().UTC()); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("logged-out token accepted")
	}
	// Recreate legacy event storage only inside this disposable test database.
	if _, err = db.ExecContext(ctx, `DELETE FROM reader_events`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.ExecContext(ctx, `ALTER TABLE reader_events DROP INDEX uk_reader_events_user_book, ADD UNIQUE KEY uk_reader_events_reading_kind (user_id,reading_id,event_kind)`); err != nil {
		t.Fatal(err)
	}
	for i, item := range []struct{ book, kind string }{
		{"mixed", "open"}, {"mixed", "open"}, {"mixed", "complete"}, {"mixed", "complete"}, {"mixed", "open"},
		{"open-only", "open"}, {"open-only", "open"}, {"done-only", "complete"}, {"done-only", "complete"},
	} {
		if _, err = db.ExecContext(ctx, `INSERT INTO reader_events(event_id,user_id,book_id,event_kind,reading_id,created_at,updated_at) VALUES(?,?,?,?,?,'2020-01-01','2021-01-01')`, fmt.Sprintf("%032x", i+500), a.ID, item.book, item.kind, fmt.Sprintf("%032x", i+600)); err != nil {
			t.Fatal(err)
		}
	}
	migration, err := os.ReadFile("../../docs/migrations/20261117_reader_events_user_book.sql")
	if err != nil {
		t.Fatal(err)
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	for _, statement := range strings.Split(string(migration), ";") {
		if strings.TrimSpace(statement) != "" {
			if _, err = conn.ExecContext(ctx, statement); err != nil {
				t.Fatal("manual reading-state migration failed", err)
			}
		}
	}
	for _, expected := range []struct{ book, kind, eventID string }{{"mixed", "complete", fmt.Sprintf("%032x", 502)}, {"open-only", "open", fmt.Sprintf("%032x", 505)}, {"done-only", "complete", fmt.Sprintf("%032x", 507)}} {
		var eventID string
		var created, updated time.Time
		if err = db.QueryRowContext(ctx, `SELECT COUNT(*),MIN(event_kind),MIN(event_id),MIN(created_at),MIN(updated_at) FROM reader_events WHERE user_id=? AND book_id=?`, a.ID, expected.book).Scan(&count, &kind, &eventID, &created, &updated); err != nil || count != 1 || kind != expected.kind || eventID != expected.eventID || created.Year() != 2020 || updated.Year() != 2021 {
			t.Fatal("migration lost first completion/open or changed timestamps", err)
		}
	}
	if _, err = db.ExecContext(ctx, `INSERT INTO reader_events(event_id,user_id,book_id,event_kind,reading_id) VALUES(?,?,'mixed','open',?)`, strings.Repeat("8", 32), a.ID, strings.Repeat("9", 32)); err == nil {
		t.Fatal("migration did not enforce account/book uniqueness")
	}
}
