package repository

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"os"
	"pic/internal/model"
	"strings"
	"testing"
	"time"
)

type materialState struct {
	importState
	book  *model.Book
	locks int
}
type materialConnector struct{ s *materialState }

func (c materialConnector) Connect(context.Context) (driver.Conn, error) {
	return &materialConn{testConn{&c.s.importState}, c.s}, nil
}
func (c materialConnector) Driver() driver.Driver { return testDriver{&c.s.importState} }

type materialConn struct {
	testConn
	s *materialState
}

func materialRows(rows [][]driver.Value, n int) driver.Rows {
	return &testRows{columns: make([]string, n), rows: rows}
}
func (c *materialConn) QueryContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	b := c.s.book
	if strings.Contains(q, "FOR UPDATE") {
		c.s.locks++
	}
	if strings.HasPrefix(q, "SELECT book_id FROM books WHERE") {
		if b == nil {
			return materialRows(nil, 1), nil
		}
		return materialRows([][]driver.Value{{b.ID}}, 1), nil
	}
	if strings.HasPrefix(q, selectBook) {
		if b == nil {
			return materialRows(nil, 23), nil
		}
		p, _ := time.Parse(time.RFC3339Nano, b.PublishedAt)
		l := b.License
		return materialRows([][]driver.Value{{b.ID, b.TitleZH, b.TitleOriginal, b.Author, b.Illustrator, b.Description, b.Cover, int64(b.PageCount), int64(b.Minutes), int64(b.Featured), p, b.Status, b.Version, b.IsDemo, l.Type, l.SourceURL, l.URL, l.Attribution, l.ReviewStatus, l.CommercialUse, l.SelfHosting, l.TranslationAllowed, l.AudioDerivativeAllowed}}, 23), nil
	}
	if strings.HasPrefix(q, "SELECT page_number,image_path") {
		rows := [][]driver.Value{}
		if b != nil {
			for _, p := range b.Pages {
				var layout driver.Value
				if p.Dialogue != nil {
					data, _ := json.Marshal(p.Dialogue)
					layout = data
				}
				rows = append(rows, []driver.Value{int64(p.Number), p.Image, p.ImageAlt, p.TextZH, p.TextOriginal, p.AudioZH, p.AudioOriginal, layout})
			}
		}
		return materialRows(rows, 8), nil
	}
	if strings.HasPrefix(q, "SELECT book_id,language_id,provider") {
		rows := [][]driver.Value{}
		if b != nil {
			for lang, v := range b.Voices {
				g, _ := time.Parse(time.RFC3339Nano, v.GeneratedAt)
				rows = append(rows, []driver.Value{b.ID, lang, v.Provider, v.VoiceID, g, v.ReviewStatus})
			}
		}
		return materialRows(rows, 6), nil
	}
	for _, entry := range []struct {
		prefix string
		values []string
	}{{"SELECT book_id,age_id", nil}, {"SELECT book_id,category_id", nil}, {"SELECT book_id,language_id", nil}} {
		if strings.HasPrefix(q, entry.prefix) {
			rows := [][]driver.Value{}
			if b != nil {
				switch entry.prefix {
				case "SELECT book_id,age_id":
					entry.values = b.Ages
				case "SELECT book_id,category_id":
					entry.values = b.Categories
				default:
					entry.values = b.Languages
				}
				for _, value := range entry.values {
					rows = append(rows, []driver.Value{b.ID, value})
				}
			}
			return materialRows(rows, 2), nil
		}
	}
	return c.testConn.QueryContext(ctx, q, args)
}
func materialBook(t *testing.T) model.Book {
	t.Helper()
	data, e := os.ReadFile("../../tests/fixtures/books/moon-rabbit.json")
	if e != nil {
		t.Fatal(e)
	}
	var b model.Book
	if e = json.Unmarshal(data, &b); e != nil {
		t.Fatal(e)
	}
	return b
}
func TestMaterialReadsUnpublishedBookAndRejectsInvalidTypography(t *testing.T) {
	b := materialBook(t)
	b.Status = "offline"
	state := &materialState{book: &b}
	db := sql.OpenDB(materialConnector{state})
	defer db.Close()
	r := New(db, false)
	snapshot, err := r.Material(context.Background(), b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Book.Status != "offline" || len(snapshot.Book.Pages) != b.PageCount || snapshot.Revision == "" {
		t.Fatal("incomplete tooling snapshot")
	}
	b.Pages[0].Dialogue = &model.DialogueLayout{Length: map[string]int{"zh": 1, "en": 1}}
	if _, err = r.Material(context.Background(), b.ID); err == nil {
		t.Fatal("silently lost invalid dialogue")
	}
}
func TestMaterialWritesLockAndCompareWholeBookBeforeAnyReplacement(t *testing.T) {
	for _, mode := range []string{"matching", "stale", "create existing", "child failure", "new"} {
		t.Run(mode, func(t *testing.T) {
			b := materialBook(t)
			state := &materialState{book: &b}
			db := sql.OpenDB(materialConnector{state})
			defer db.Close()
			r := New(db, false)
			snapshot, e := r.Material(context.Background(), b.ID)
			if e != nil {
				t.Fatal(e)
			}
			rev := snapshot.Revision
			switch mode {
			case "stale":
				b.Pages[0].TextZH += "并发修改"
			case "create existing":
				rev = ""
			case "child failure":
				state.failPages = true
			case "new":
				state.book = nil
				rev = ""
			}
			err := r.SaveMaterial(context.Background(), snapshot.Book, rev)
			fail := mode == "stale" || mode == "create existing" || mode == "child failure"
			if (err != nil) != fail {
				t.Fatalf("unexpected error %v", err)
			}
			if mode == "stale" || mode == "create existing" {
				if !errors.Is(err, ErrMaterialConflict) || state.writes != 0 {
					t.Fatal("stale operation wrote data")
				}
			}
			if state.locks == 0 {
				t.Fatal("missing row lock")
			}
			if fail && state.rollback == 0 {
				t.Fatal("missing rollback")
			}
		})
	}
}
