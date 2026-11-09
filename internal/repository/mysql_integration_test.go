package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"pic/internal/catalog"
	"pic/internal/config"
	"pic/internal/database"
	"pic/internal/model"
)

// Opt-in: PIC_MYSQL_TEST=1 DB_USER=... DB_PASSWORD=... go test ./internal/repository -run TestMySQLIntegration -v
// Uses a unique temporary database. Requires CREATE/DROP DATABASE privileges.
func TestMySQLIntegration(t *testing.T) {
	if os.Getenv("PIC_MYSQL_TEST") != "1" {
		t.Skip("requires an accessible MySQL 8+ instance and PIC_MYSQL_TEST=1")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	cfg, err := config.Load("")
	if err != nil {
		t.Fatal(err)
	}
	dbConfig := cfg.Database
	dbConfig.Name = ""
	admin, err := database.Open(ctx, dbConfig)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	name := fmt.Sprintf("pic_test_%d", time.Now().UnixNano())
	if _, err = admin.ExecContext(ctx, "CREATE DATABASE `"+name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"); err != nil {
		t.Fatal(err)
	}
	defer func() {
		cleanup, c := context.WithTimeout(context.Background(), 10*time.Second)
		defer c()
		if _, e := admin.ExecContext(cleanup, "DROP DATABASE `"+name+"`"); e != nil {
			t.Errorf("cleanup temporary database: %v", e)
		}
	}()
	dbConfig.Name = name
	db, err := database.Open(ctx, dbConfig)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for i := 0; i < 2; i++ {
		if err = database.Initialize(ctx, db, "../../docs/schema.sql"); err != nil {
			t.Fatal(err)
		}
	}
	fixture, err := catalog.Load("../../tests/fixtures/books", "../../tests/fixtures/web", false)
	if err != nil {
		t.Fatal(err)
	}
	r := New(db, false)
	var originalRowID uint64
	for i := 0; i < 2; i++ {
		if err = r.Import(ctx, fixture.Books); err != nil {
			t.Fatal(err)
		}
		var rowID uint64
		if err = db.QueryRowContext(ctx, "SELECT id FROM books WHERE book_id=?", fixture.Books[0].ID).Scan(&rowID); err != nil {
			t.Fatal(err)
		}
		if rowID == 0 {
			t.Fatal("book row did not receive a generated id")
		}
		if i == 0 {
			originalRowID = rowID
		} else if rowID != originalRowID {
			t.Fatal("reimport replaced the book row identity")
		}
	}
	for _, table := range []string{"books", "book_licenses", "age_ranges", "categories", "languages", "book_age_ranges", "book_categories", "book_languages", "book_pages"} {
		var badIDs int
		if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table+" WHERE id IS NULL OR id=0").Scan(&badIDs); err != nil || badIDs != 0 {
			t.Fatalf("generated identities missing in %s: %v", table, err)
		}
	}
	items, total, err := r.List(ctx, model.Query{})
	if err != nil || total != 10 || len(items) != 10 {
		t.Fatalf("list total=%d len=%d err=%v", total, len(items), err)
	}
	for _, q := range []struct {
		q    model.Query
		want int
	}{{model.Query{Q: "HONEY"}, 1}, {model.Query{Age: "5-6", Category: "nature"}, 1}, {model.Query{Language: "en"}, 10}, {model.Query{Q: "动物朋友"}, 5}, {model.Query{IDs: []string{}}, 0}, {model.Query{Q: "%"}, 0}, {model.Query{Q: "' OR 1=1 --"}, 0}} {
		_, total, err = r.List(ctx, q.q)
		if err != nil || total != q.want {
			t.Fatalf("query %+v total=%d want=%d err=%v", q.q, total, q.want, err)
		}
	}
	// Check all related fields and page order survive the JSON -> MySQL -> API-model round trip.
	for _, want := range fixture.Books {
		got, err := r.Get(ctx, want.ID)
		if err != nil {
			t.Fatal(err)
		}
		pages, err := r.Pages(ctx, want.ID)
		if err != nil {
			t.Fatal(err)
		}
		got.Pages = pages
		want.PublishedAt = mustUTC(t, want.PublishedAt)
		a, _ := json.Marshal(got)
		b, _ := json.Marshal(want)
		if string(a) != string(b) {
			t.Fatalf("round trip mismatch %s\ngot %s\nwant %s", want.ID, a, b)
		}
	}

	voiceBook := fixture.Books[0]
	voiceBook.Pages = append([]model.Page(nil), voiceBook.Pages...)
	for i := range voiceBook.Pages {
		voiceBook.Pages[i].AudioZH = fmt.Sprintf("/assets/voices/page-%d.mp3", i+1)
	}
	voiceBook.Voices = map[string]model.Voice{"zh": {Provider: "test", VoiceID: "voice-1", GeneratedAt: "2026-11-04T08:00:00Z", ReviewStatus: "pending"}}
	if err = r.Import(ctx, []model.Book{voiceBook}); err != nil {
		t.Fatal(err)
	}
	voiced, err := r.Get(ctx, voiceBook.ID)
	if err != nil || voiced.Voices["zh"].VoiceID != "voice-1" {
		t.Fatal("voice record round trip", err)
	}
	voicePages, err := r.Pages(ctx, voiceBook.ID)
	if err != nil || voicePages[0].AudioZH == "" {
		t.Fatal("audio path round trip", err)
	}
	if err = r.Import(ctx, []model.Book{fixture.Books[0]}); err != nil {
		t.Fatal(err)
	}
	unvoiced, err := r.Get(ctx, voiceBook.ID)
	if err != nil || len(unvoiced.Voices) != 0 {
		t.Fatal("stale voices after reimport", err)
	}
	options, err := r.Options(ctx)
	if err != nil || len(options.Categories) != 6 || len(options.Ages) != 3 || len(options.Languages) != 2 {
		t.Fatalf("options %v %v", options, err)
	}
	if _, err = New(db, true).Get(ctx, fixture.Books[0].ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("strict visibility: %v", err)
	}
	_, total, err = r.List(ctx, model.Query{Limit: 3, Offset: 9})
	if err != nil || total != 10 {
		t.Fatal(total, err)
	}
	// A failed child write rolls back both the new parent and earlier parent updates.
	original := fixture.Books[0]
	changed := original
	changed.TitleZH = "should be rolled back"
	bad := fixture.Books[1]
	bad.ID = "rollback-new-book"
	if _, err = db.ExecContext(ctx, `CREATE TRIGGER pic_reject_test_page BEFORE INSERT ON book_pages FOR EACH ROW BEGIN IF NEW.book_id='rollback-new-book' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='rollback test'; END IF; END`); err != nil {
		t.Fatal(err)
	}
	if err = r.Import(ctx, []model.Book{changed, bad}); err == nil {
		t.Fatal("expected transaction failure")
	}
	if _, err = db.ExecContext(ctx, "DROP TRIGGER pic_reject_test_page"); err != nil {
		t.Fatal(err)
	}
	got, err := r.Get(ctx, original.ID)
	if err != nil || got.TitleZH != original.TitleZH {
		t.Fatal("failed transaction changed existing book", err)
	}
	if _, err = r.Get(ctx, bad.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("failed transaction left a new book", err)
	}
	// Downstream child rows are replaced, so removed pages are not left behind.
	short := original
	short.Pages = short.Pages[:2]
	short.PageCount = 2
	if err = r.Import(ctx, []model.Book{short}); err != nil {
		t.Fatal(err)
	}
	pages, err := r.Pages(ctx, short.ID)
	if err != nil || len(pages) != 2 {
		t.Fatal("stale pages after reimport", err)
	}
	short.Status = "offline"
	if err = r.Import(ctx, []model.Book{short}); err != nil {
		t.Fatal(err)
	}
	if _, err = r.Get(ctx, short.ID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("offline book remained public", err)
	}
}
func mustUTC(t *testing.T, value string) string {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatal(err)
	}
	return parsed.UTC().Format(time.RFC3339Nano)
}
