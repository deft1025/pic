package router

import (
	"encoding/xml"
	"fmt"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"pic/internal/catalog"
	"pic/internal/model"
	"pic/internal/service"
)

func sitemapLocations(t *testing.T, w *httptest.ResponseRecorder) []string {
	t.Helper()
	if w.Code != 200 || w.Header().Get("Content-Type") != "application/xml; charset=utf-8" || w.Header().Get("Cache-Control") != "no-cache" || !strings.HasPrefix(w.Body.String(), xml.Header) {
		t.Fatalf("invalid sitemap response: %d %v %s", w.Code, w.Header(), w.Body.String())
	}
	var doc struct {
		XMLName xml.Name
		URLs    []struct {
			Location string `xml:"loc"`
		} `xml:"url"`
	}
	if err := xml.Unmarshal(w.Body.Bytes(), &doc); err != nil {
		t.Fatal(err)
	}
	if doc.XMLName.Local != "urlset" || doc.XMLName.Space != "http://www.sitemaps.org/schemas/sitemap/0.9" {
		t.Fatalf("wrong sitemap namespace: %v", doc.XMLName)
	}
	locations := []string{}
	for _, entry := range doc.URLs {
		locations = append(locations, entry.Location)
	}
	return locations
}

func TestSitemapListsAllPublishedBooksAndUpdatesImmediately(t *testing.T) {
	c := &catalog.Catalog{}
	for i := range 125 {
		c.Books = append(c.Books, model.Book{ID: fmt.Sprintf("book-%03d", i), Status: "published"})
	}
	c.Books = append(c.Books, model.Book{ID: "offline-book", Status: "offline"}, model.Book{ID: "draft-book", Status: "draft"})
	h := New(service.NewLibrary(memoryStore{c}, "https://media.example.com/pic"), "../../web", "https://media.example.com/pic", "https://books.example.com")
	locations := sitemapLocations(t, request(t, h, "/sitemap.xml", 200))
	if len(locations) != 130 {
		t.Fatalf("sitemap truncated at catalog pagination limit: %d", len(locations))
	}
	seen := map[string]bool{}
	for _, location := range locations {
		if seen[location] || !strings.HasPrefix(location, "https://books.example.com/") || strings.Contains(location, "offline") || strings.Contains(location, "draft") || strings.Contains(location, "?") || strings.Contains(location, "/shelf") || strings.Contains(location, "/read/") {
			t.Fatalf("unexpected sitemap location %s", location)
		}
		seen[location] = true
	}
	for _, path := range []string{"/", "/books", "/about", "/copyright", "/privacy", "/book/book-124"} {
		if !seen["https://books.example.com"+path] {
			t.Fatal("missing location", path)
		}
		request(t, h, path, 200)
	}
	c.Books[0].Status = "offline"
	c.Books[len(c.Books)-1].Status = "published"
	locations = sitemapLocations(t, request(t, h, "/sitemap.xml", 200))
	joined := strings.Join(locations, "\n")
	if len(locations) != 130 || strings.Contains(joined, "/book/book-000") || !strings.Contains(joined, "/book/draft-book") {
		t.Fatal("sitemap did not reflect publishing changes")
	}
	request(t, h, "/sitemap.xml/extra", 404)
}

func TestSitemapOriginAndEscaping(t *testing.T) {
	id := "小熊 & friend?#"
	c := &catalog.Catalog{Books: []model.Book{{ID: id, Status: "published"}}}
	for _, tc := range []struct{ requestURL, configured, wantBase string }{
		{"http://localhost:8198/sitemap.xml", "", "http://localhost:8198"},
		{"https://books.example.com/sitemap.xml", "", "https://books.example.com"},
		{"http://internal:8198/sitemap.xml", "https://public.example.com", "https://public.example.com"},
	} {
		h := New(service.NewLibrary(memoryStore{c}, ""), "../../web", "", tc.configured)
		r := httptest.NewRequest("GET", tc.requestURL, nil)
		r.Header.Set("X-Forwarded-Host", "untrusted.example.com")
		r.Header.Set("X-Forwarded-Proto", "https")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		locations := sitemapLocations(t, w)
		if locations[0] != tc.wantBase+"/" || locations[5] != tc.wantBase+"/book/"+url.PathEscape(id) {
			t.Fatalf("incorrect origin or path escaping: %v", locations)
		}
	}
}

func TestSitemapEmptyLibraryStillListsPublicPages(t *testing.T) {
	h := New(service.NewLibrary(memoryStore{&catalog.Catalog{}}, ""), "../../web", "", "https://books.example.com")
	if got := len(sitemapLocations(t, request(t, h, "/sitemap.xml", 200))); got != 5 {
		t.Fatalf("empty library sitemap has %d entries", got)
	}
}
