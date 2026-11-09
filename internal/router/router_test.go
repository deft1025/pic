package router

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pic/internal/catalog"
	"pic/internal/model"
	"pic/internal/service"
)

func setup(t *testing.T) http.Handler {
	t.Helper()
	c, err := catalog.Load("../../tests/fixtures/books", "../../tests/fixtures/web", false)
	if err != nil {
		t.Fatal(err)
	}
	// Use the real app shell and isolated fixture assets. Test-only media are
	// never copied into web/assets or served by the production application.
	webDir := t.TempDir()
	entries, err := os.ReadDir("../../web")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join("../../web", entry.Name()))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(webDir, entry.Name()), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.CopyFS(filepath.Join(webDir, "assets"), os.DirFS("../../tests/fixtures/web/assets")); err != nil {
		t.Fatal(err)
	}
	return New(service.NewLibrary(memoryStore{c}, ""), webDir, "")
}
func request(t *testing.T, h http.Handler, path string, want int) *httptest.ResponseRecorder {
	t.Helper()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
	if w.Code != want {
		t.Fatalf("%s: got %d want %d: %s", path, w.Code, want, w.Body.String())
	}
	return w
}
func TestCatalogAPI(t *testing.T) {
	h := setup(t)
	for _, tc := range []struct {
		path  string
		count int
	}{{"/api/books", 10}, {"/api/search?q=HONEY", 1}, {"/api/search?q=%E5%B0%8F%E5%B0%8F%E7%BB%98%E6%9C%AC%E9%A6%86", 10}, {"/api/books?age=5-6&category=nature", 1}, {"/api/books?ids=moon-rabbit,seed-journey", 2}, {"/api/books?ids=", 0}, {"/api/search?q=does-not-exist", 0}} {
		w := request(t, h, tc.path, 200)
		var b struct {
			Items []model.Book `json:"items"`
			Total int          `json:"total"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &b); err != nil {
			t.Fatal(err)
		}
		if b.Total != tc.count {
			t.Errorf("%s: %d want %d", tc.path, b.Total, tc.count)
		}
		for _, book := range b.Items {
			if len(book.Pages) != 0 {
				t.Error("list must not ship all pages")
			}
		}
	}
	w := request(t, h, "/api/books?limit=3&offset=9", 200)
	var page struct {
		Items []model.Book `json:"items"`
		Total int          `json:"total"`
	}
	json.Unmarshal(w.Body.Bytes(), &page)
	if len(page.Items) != 1 || page.Total != 10 {
		t.Fatal("pagination broken")
	}
	request(t, h, "/api/books?limit=0", 400)
	request(t, h, "/api/books?offset=-1", 400)
	request(t, h, "/api/books/not-a-book", 404)
	request(t, h, "/api/books/not-a-book/pages", 404)
	request(t, h, "/api/nope", 404)
}
func TestEveryStoryAndAsset(t *testing.T) {
	h := setup(t)
	c, _ := catalog.Load("../../tests/fixtures/books", "../../tests/fixtures/web", false)
	for _, b := range c.Books {
		request(t, h, "/api/books/"+b.ID, 200)
		w := request(t, h, "/api/books/"+b.ID+"/pages", 200)
		var pages struct {
			Items []model.Page `json:"items"`
		}
		json.Unmarshal(w.Body.Bytes(), &pages)
		if len(pages.Items) != b.PageCount {
			t.Fatal("incorrect page count")
		}
		request(t, h, b.Cover, 200)
		for i, p := range pages.Items {
			if p.Number != i+1 || p.TextZH == "" || p.TextOriginal == "" {
				t.Fatalf("bad page %s %d", b.ID, i)
			}
			request(t, h, p.Image, 200)
		}
	}
	for _, p := range []string{"/", "/books", "/book/moon-rabbit", "/read/moon-rabbit", "/shelf", "/about", "/privacy", "/copyright"} {
		w := request(t, h, p, 200)
		if !strings.Contains(w.Body.String(), "小小绘本馆") {
			t.Error("app shell missing")
		}
		if !strings.Contains(w.Header().Get("Content-Security-Policy"), "default-src 'self'") {
			t.Error("missing security policy")
		}
	}
	request(t, h, "/assets/", 404)
	request(t, h, "/assets/unknown.mp3", 404)
	request(t, h, "/content/books/moon-rabbit.json", 404)
	request(t, h, "/.env", 404)
}
func TestOnlyPublishedStoriesVisible(t *testing.T) {
	c, err := catalog.Load("../../tests/fixtures/books", "../../tests/fixtures/web", false)
	if err != nil {
		t.Fatal(err)
	}
	c.Books[0].Status = "offline"
	c.Books[1].Status = "draft"
	h := New(service.NewLibrary(memoryStore{c}, ""), "../../web", "")
	request(t, h, "/api/books/"+c.Books[0].ID, 404)
	request(t, h, "/api/books/"+c.Books[1].ID+"/pages", 404)
	_, total := c.List(model.Query{})
	if total != 8 {
		t.Fatalf("got %d published books", total)
	}
}

// Memory adapter is test-only. Production always uses repository.MySQL.
type memoryStore struct{ c *catalog.Catalog }

func (m memoryStore) Ping(context.Context) error { return nil }
func (m memoryStore) List(_ context.Context, q model.Query) ([]model.Book, int, error) {
	items, total := m.c.List(q)
	return items, total, nil
}
func (m memoryStore) Get(_ context.Context, id string) (model.Book, error) {
	b, ok := m.c.Get(id)
	if !ok {
		return b, sql.ErrNoRows
	}
	return b, nil
}
func (m memoryStore) Pages(_ context.Context, id string) ([]model.Page, error) {
	b, ok := m.c.Get(id)
	if !ok {
		return nil, sql.ErrNoRows
	}
	return b.Pages, nil
}
func (m memoryStore) Options(context.Context) (model.Options, error) {
	return model.Options{Ages: catalog.Ages, Categories: catalog.Categories, Languages: []model.Option{{ID: "zh", Name: "中文"}, {ID: "en", Name: "英文"}}}, nil
}

// Infrastructure failures must return 503, not be mistaken for a missing book.
type unavailableStore struct{ memoryStore }

func (unavailableStore) Ping(context.Context) error { return errors.New("private database error") }
func (unavailableStore) List(context.Context, model.Query) ([]model.Book, int, error) {
	return nil, 0, errors.New("private database error")
}
func (unavailableStore) Get(context.Context, string) (model.Book, error) {
	return model.Book{}, errors.New("private database error")
}
func (unavailableStore) Options(context.Context) (model.Options, error) {
	return model.Options{}, errors.New("private database error")
}
func TestDatabaseFailure(t *testing.T) {
	h := New(service.NewLibrary(unavailableStore{}, ""), "../../web", "")
	for _, path := range []string{"/api/health", "/api/books", "/api/search?q=x", "/api/categories", "/api/books/moon-rabbit", "/api/books/moon-rabbit/pages"} {
		w := request(t, h, path, 503)
		if strings.Contains(w.Body.String(), "private database error") {
			t.Fatal("database details leaked to reader")
		}
	}
}
