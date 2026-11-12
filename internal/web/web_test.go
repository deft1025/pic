package web

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestGoogleVerificationFile(t *testing.T) {
	dir := t.TempDir()
	const name = "google0123456789abcdef.html"
	const body = "google-site-verification: " + name
	for _, file := range []string{name, "private.html", "index.html"} {
		if err := os.WriteFile(filepath.Join(dir, file), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, tc := range []struct {
		path string
		code int
	}{
		{"/" + name, http.StatusOK},
		{"/googlemissing.html", http.StatusNotFound},
		{"/private.html", http.StatusNotFound},
		{"/nested/" + name, http.StatusNotFound},
	} {
		t.Run(tc.path, func(t *testing.T) {
			w := httptest.NewRecorder()
			Handler(dir).ServeHTTP(w, httptest.NewRequest(http.MethodGet, tc.path, nil))
			if w.Code != tc.code {
				t.Fatalf("status = %d, want %d", w.Code, tc.code)
			}
			if tc.code == http.StatusOK && w.Body.String() != body {
				t.Fatalf("verification contents changed: %q", w.Body.String())
			}
		})
	}
}
