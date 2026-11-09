package router

import (
	"log"
	"net/http"
	"net/url"

	"pic/internal/handler"
)

func SecurityHeaders(next http.Handler, assetBaseURL string) http.Handler {
	assetSource := ""
	// The base URL is validated by config.Load. CSP grants images/media only,
	// and uses the origin so optional deployment path prefixes also work.
	if u, err := url.Parse(assetBaseURL); err == nil && u.Host != "" {
		assetSource = " " + u.Scheme + "://" + u.Host
	}
	policy := "default-src 'self'; img-src 'self' data:" + assetSource + "; media-src 'self'" + assetSource + "; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", policy)
		next.ServeHTTP(w, r)
	})
}
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recover() != nil {
				log.Print("request panic recovered")
				handler.Fail(w, http.StatusInternalServerError, "服务暂时不可用，请稍后重试")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
