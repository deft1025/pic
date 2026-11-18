package handler

import (
	"net/http"
	"net/http/httptest"
	"pic/internal/service"
	"strings"
	"testing"
)

func TestAccountBodyRejectsUnknownFieldsOversizeAndTrailingJSON(t *testing.T) {
	for _, body := range []string{`{"code":"x","user_id":"spoof"}`, `{"code":"x"} {}`, `{"code":"` + strings.Repeat("x", 40<<10) + `"}`, `null`} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/", strings.NewReader(body))
		var p struct {
			Code string `json:"code"`
		}
		ok := decodeAccount(w, r, &p)
		if body == "null" {
			continue
		} // Service validates the zero-valued payload.
		if ok || w.Code != 400 {
			t.Fatal("unsafe request accepted")
		}
	}
	h := NewAccounts(nil)
	w := httptest.NewRecorder()
	h.Login(w, httptest.NewRequest("POST", "/", strings.NewReader(`{"code":"x"}`)))
	if w.Code != 503 || !strings.Contains(w.Body.String(), "尚未启用") {
		t.Fatal("disabled login did not fail safely")
	}
}

func TestEnabledLoginProbeNeedsNoWeChatCodeOrDatabase(t *testing.T) {
	h := NewAccounts(service.NewAccounts(nil, nil, nil))
	w := httptest.NewRecorder()
	h.Login(w, httptest.NewRequest("POST", "/", strings.NewReader(`{}`)))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "登录凭证无效") {
		t.Fatal("enabled login probe must stop before upstream or storage", w.Code, w.Body.String())
	}
}
func TestLoginLimiterDoesNotTrustForwardedIP(t *testing.T) {
	h := NewAccounts(nil)
	for i := 0; i < 31; i++ {
		r := httptest.NewRequest("POST", "/", nil)
		r.RemoteAddr = "127.0.0.1:3000"
		r.Header.Set("X-Forwarded-For", strings.Repeat("a", i))
		if h.allow(r, true) != (i < 30) {
			t.Fatal("limiter bypass")
		}
	}
}

func TestReaderAccountEndpointsRequireLoginIncludingEvents(t *testing.T) {
	h := NewAccounts(service.NewAccounts(nil, nil, nil))
	for _, endpoint := range []struct {
		name   string
		handle http.HandlerFunc
	}{{"completed-books", h.CompletedBooks}, {"favorites", h.Favorites}, {"set-favorites", h.SetFavorites}, {"profile", h.Profile}, {"save-profile", h.SaveProfile}, {"events", h.Event}} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/", strings.NewReader(`{}`))
		endpoint.handle(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s accepts guest: %d", endpoint.name, w.Code)
		}
	}
}
