package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestValidateOnlyUsesSharedFileAndCLIOverrides(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pic.env")
	if err := os.WriteFile(path, []byte("CONTENT_DIR=missing-content\nWEB_DIR=missing-web\nDB_HOST=unreachable.invalid\nREQUIRE_LICENSE_APPROVAL=false\n"), 0600); err != nil {
		t.Fatal(err)
	}
	// CLI paths win over file paths. validate-only never opens the database.
	if err := run(path, "../../tests/fixtures/books", "../../tests/fixtures/web", "", true); err != nil {
		t.Fatal(err)
	}
	if err := run(path, "", "", "", true); err == nil {
		t.Fatal("configured content path ignored")
	}
	if err := run(path+".missing", "../../content/books", "../../web", "", true); err == nil {
		t.Fatal("missing configuration ignored")
	}
}

func TestValidateWithoutAnyLocalBookAssets(t *testing.T) {
	var requests atomic.Int32
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Method != "HEAD" || !strings.HasPrefix(r.URL.Path, "/pic/assets/fixture/") {
			t.Errorf("unexpected asset request: %s %s", r.Method, r.URL.Path)
		}
		if strings.HasSuffix(r.URL.Path, ".wav") {
			w.Header().Set("Content-Type", "audio/wav")
		} else {
			w.Header().Set("Content-Type", "image/svg+xml")
		}
		w.Header().Set("Content-Length", "100")
	})
	original := http.DefaultTransport
	http.DefaultTransport = assetTransport(func(r *http.Request) (*http.Response, error) {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w.Result(), nil
	})
	t.Cleanup(func() { http.DefaultTransport = original })
	t.Setenv("ASSET_BASE_URL", "https://media.example.test/pic")
	t.Setenv("ASSET_CHECK_MODE", "auto")
	path := filepath.Join(t.TempDir(), "pic.env")
	if err := os.WriteFile(path, []byte("DB_HOST=unreachable.invalid\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := run(path, "../../tests/fixtures/books", filepath.Join(t.TempDir(), "missing-web"), "", true); err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 2 {
		t.Fatalf("shared image and audio should each be checked once, got %d", requests.Load())
	}
}

type assetTransport func(*http.Request) (*http.Response, error)

func (f assetTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
