// Package web serves only public assets and the known SPA routes.
package web

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var googleVerificationFile = regexp.MustCompile(`^/google[a-zA-Z0-9]+\.html$`)

func Handler(webDir string) http.Handler {
	mux := http.NewServeMux()
	files := http.FileServer(http.Dir(webDir))
	mux.HandleFunc("GET /assets/", func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "..") {
			http.NotFound(w, r)
			return
		}
		info, err := os.Stat(filepath.Join(webDir, filepath.FromSlash(strings.TrimPrefix(r.URL.Path, "/"))))
		if err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=3600")
		files.ServeHTTP(w, r)
	})
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/app.js" || r.URL.Path == "/styles.css" || r.URL.Path == "/favicon.svg" || googleVerificationFile.MatchString(r.URL.Path) {
			files.ServeHTTP(w, r)
			return
		}
		path := r.URL.Path
		if path != "/" && path != "/books" && path != "/shelf" && path != "/about" && path != "/privacy" && path != "/copyright" && !strings.HasPrefix(path, "/book/") && !strings.HasPrefix(path, "/read/") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
	})
	return mux
}
