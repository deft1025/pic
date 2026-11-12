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

func TestValidateFromProjectRootAndImporterDirectory(t *testing.T) {
	root := t.TempDir()
	for _, item := range []struct{ target, source string }{
		{"books", "../../tests/fixtures/books"},
		{"public", "../../tests/fixtures/web"},
	} {
		if err := os.CopyFS(filepath.Join(root, item.target), os.DirFS(item.source)); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "go.mod"), []byte("module pic\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("CONTENT_DIR=books\nWEB_DIR=public\nDB_NAME=root_config\nDB_HOST=unreachable.invalid\n"), 0600); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, "cmd", "importer")
	if err := os.MkdirAll(nested, 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CONFIG_FILE", "")
	t.Setenv("ASSET_BASE_URL", "")
	t.Setenv("ASSET_CHECK_MODE", "local")
	for _, dir := range []string{root, nested} {
		t.Run(filepath.Base(dir), func(t *testing.T) {
			t.Chdir(dir)
			cfg, err := loadConfig("")
			if err != nil {
				t.Fatal(err)
			}
			if cfg.Database.Name != "root_config" || cfg.Content.Dir != filepath.Join(root, "books") || cfg.Content.WebDir != filepath.Join(root, "public") {
				t.Fatal("project configuration or resource paths not resolved")
			}
			if err := run("", "", "", "", true); err != nil {
				t.Fatal(err)
			}
		})
	}
	t.Chdir(nested)
	for _, name := range []string{"selected", "explicit"} {
		if err := os.WriteFile(name+".env", []byte("DB_NAME="+name+"\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("CONFIG_FILE", "selected.env")
	for _, path := range []string{"", "explicit.env"} {
		cfg, err := loadConfig(path)
		if err != nil {
			t.Fatal(err)
		}
		want := "selected"
		if path != "" {
			want = "explicit"
		}
		if cfg.Database.Name != want {
			t.Fatal("explicit configuration selection ignored")
		}
	}
}

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
