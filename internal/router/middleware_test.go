package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExternalAssetPolicy(t *testing.T) {
	for _, base := range []string{"", "https://media.example.com:8443/pic"} {
		w := httptest.NewRecorder()
		SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}), base).ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
		policy := w.Header().Get("Content-Security-Policy")
		if w.Code != http.StatusNoContent || !strings.Contains(policy, "script-src 'self'; connect-src 'self';") {
			t.Fatal("asset domain must not expand script or API access")
		}
		if base == "" {
			if strings.Contains(policy, "media.example.com") {
				t.Fatal("local mode allows an external asset domain")
			}
		} else if !strings.Contains(policy, "img-src 'self' data: https://media.example.com:8443;") || !strings.Contains(policy, "media-src 'self' https://media.example.com:8443;") {
			t.Fatal("configured image/audio origin missing from CSP", policy)
		}
	}
}
