package assets

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Exercise the real HTTP client without binding a socket in restricted sandboxes.
type httpFixture struct {
	URL     string
	handler http.Handler
}

func newHTTPFixture(handler http.Handler) *httpFixture {
	return &httpFixture{URL: "https://media.example.test", handler: handler}
}
func (s *httpFixture) Close() {}
func (s *httpFixture) RoundTrip(req *http.Request) (*http.Response, error) {
	recorder := httptest.NewRecorder()
	s.handler.ServeHTTP(recorder, req)
	if err := req.Context().Err(); err != nil {
		return nil, err
	}
	return recorder.Result(), nil
}

func TestAutoUsesLocalAndChecksOnlyMissingAssetsOnce(t *testing.T) {
	web := t.TempDir()
	if err := os.MkdirAll(filepath.Join(web, "assets"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(web, "assets/local.svg"), []byte("svg"), 0644); err != nil {
		t.Fatal(err)
	}
	var requests atomic.Int32
	server := newHTTPFixture(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Method != "HEAD" || r.URL.Path != "/pic/assets/en.mp3" {
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "audio/mpeg")
		w.Header().Set("Content-Length", "100")
	}))
	defer server.Close()
	checker, err := NewChecker(Options{WebDir: web, BaseURL: server.URL + "/pic/"})
	checker.client.Transport = server
	if err != nil {
		t.Fatal(err)
	}
	if err := checker.Check(context.Background(), []string{"/assets/local.svg", "/assets/en.mp3", "/assets/en.mp3"}); err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 1 {
		t.Fatal("duplicate/local resources should not make remote requests")
	}
	local, _ := NewChecker(Options{WebDir: web, BaseURL: server.URL, Mode: "local"})
	local.client.Transport = server
	if err := local.Check(context.Background(), []string{"/assets/en.mp3"}); err == nil {
		t.Fatal("local mode silently used remote")
	}
}

func TestRemoteRejectsMissingHTMLAndEmptyResourcesEvenWithLocalCopy(t *testing.T) {
	for _, scenario := range []string{"missing", "html", "empty", "ok"} {
		t.Run(scenario, func(t *testing.T) {
			web := t.TempDir()
			os.Mkdir(filepath.Join(web, "assets"), 0755)
			os.WriteFile(filepath.Join(web, "assets/page.svg"), []byte("local"), 0644)
			server := newHTTPFixture(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "image/svg+xml")
				w.Header().Set("Content-Length", "100")
				switch scenario {
				case "missing":
					w.WriteHeader(404)
				case "html":
					w.Header().Set("Content-Type", "text/html")
				case "empty":
					w.Header().Set("Content-Length", "0")
				}
			}))
			defer server.Close()
			checker, _ := NewChecker(Options{WebDir: web, BaseURL: server.URL, Mode: "remote"})
			checker.client.Transport = server
			err := checker.Check(context.Background(), []string{"/assets/page.svg"})
			if (err == nil) != (scenario == "ok") {
				t.Fatalf("incorrect resource result: %v", err)
			}
		})
	}
}

func TestHEADFallbackUsesRangeAndValidatesBody(t *testing.T) {
	for _, empty := range []bool{false, true} {
		server := newHTTPFixture(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == "HEAD" {
				w.WriteHeader(405)
				return
			}
			if r.Header.Get("Range") != "bytes=0-0" {
				t.Error("fallback would download the full resource")
			}
			w.Header().Set("Content-Type", "audio/mpeg")
			w.WriteHeader(206)
			if !empty {
				w.Write([]byte{1})
			}
		}))
		checker, _ := NewChecker(Options{BaseURL: server.URL, Mode: "remote"})
		checker.client.Transport = server
		err := checker.Check(context.Background(), []string{"/assets/page.mp3"})
		server.Close()
		if (err != nil) != empty {
			t.Fatal("fallback accepted empty audio or rejected a valid byte", err)
		}
	}
}

func TestTimeoutAndUnsafePathsFail(t *testing.T) {
	server := newHTTPFixture(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
	defer server.Close()
	checker, _ := NewChecker(Options{BaseURL: server.URL, Mode: "remote", Timeout: 20 * time.Millisecond})
	checker.client.Transport = server
	if err := checker.Check(context.Background(), []string{"/assets/page.svg"}); err == nil {
		t.Fatal("timeout ignored")
	}
	for _, path := range []string{"/assets/../.env", "/assets/%2e%2e/private.svg", "https://other.invalid/page.svg"} {
		if err := checker.Check(context.Background(), []string{path}); err == nil || !strings.Contains(err.Error(), "无效素材路径") {
			t.Fatal("unsafe path accepted", err)
		}
	}
}

func TestRemoteConcurrencyIsBounded(t *testing.T) {
	var active, maximum atomic.Int32
	server := newHTTPFixture(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := active.Add(1)
		defer active.Add(-1)
		for old := maximum.Load(); current > old && !maximum.CompareAndSwap(old, current); old = maximum.Load() {
		}
		time.Sleep(time.Millisecond)
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Header().Set("Content-Length", "10")
	}))
	checker, _ := NewChecker(Options{BaseURL: server.URL, Mode: "remote", Concurrency: 3})
	checker.client.Transport = server
	var paths []string
	for i := range 18 {
		paths = append(paths, fmt.Sprintf("/assets/page-%d.svg", i))
	}
	if err := checker.Check(context.Background(), paths); err != nil {
		t.Fatal(err)
	}
	if maximum.Load() > 3 || maximum.Load() == 0 {
		t.Fatal("remote concurrency limit ignored", maximum.Load())
	}
}
