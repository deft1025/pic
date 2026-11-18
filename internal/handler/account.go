package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"pic/internal/model"
	"pic/internal/service"
)

type accountLimit struct {
	at    time.Time
	count int
}
type AccountHandler struct {
	accounts *service.Accounts
	mu       sync.Mutex
	limits   map[string]accountLimit
}

func NewAccounts(accounts *service.Accounts) *AccountHandler {
	return &AccountHandler{accounts: accounts, limits: map[string]accountLimit{}}
}

// Per-process abuse guard. Never trust forwarded IP headers without a trusted proxy.
func (h *AccountHandler) allow(r *http.Request, login bool) bool {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	key := host + "/events"
	max := 240
	if login {
		key = host + "/login"
		max = 30
	}
	now := time.Now()
	h.mu.Lock()
	defer h.mu.Unlock()
	for k, v := range h.limits {
		if now.Sub(v.at) > time.Minute {
			delete(h.limits, k)
		}
	}
	v := h.limits[key]
	if v.at.IsZero() {
		if len(h.limits) >= 10000 {
			return false
		}
		v.at = now
	}
	v.count++
	h.limits[key] = v
	return v.count <= max
}
func decodeAccount(w http.ResponseWriter, r *http.Request, dest any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(dest); err != nil {
		Fail(w, 400, "请求格式无效")
		return false
	}
	if d.Decode(new(any)) != io.EOF {
		Fail(w, 400, "请求格式无效")
		return false
	}
	return true
}
func accountToken(r *http.Request) string {
	v := r.Header.Get("Authorization")
	if !strings.HasPrefix(v, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(v, "Bearer ")
}
func (h *AccountHandler) user(w http.ResponseWriter, r *http.Request) (string, bool) {
	if h.accounts == nil {
		Fail(w, 503, "小程序账号服务尚未启用")
		return "", false
	}
	user, err := h.accounts.Authenticate(r.Context(), accountToken(r))
	if err != nil {
		respond(w, nil, err)
		return "", false
	}
	return user, true
}
func (h *AccountHandler) Login(w http.ResponseWriter, r *http.Request) {
	if h.accounts == nil {
		Fail(w, 503, "微信登录尚未启用，请联系管理员")
		return
	}
	if !h.allow(r, true) {
		Fail(w, 429, "登录过于频繁，请稍后再试")
		return
	}
	var input struct {
		Code string `json:"code"`
	}
	if !decodeAccount(w, r, &input) {
		return
	}
	result, err := h.accounts.Login(r.Context(), input.Code)
	if err != nil {
		code := "login_failed"
		var failure *service.Error
		if errors.As(err, &failure) && failure.Code != "" {
			code = failure.Code
		}
		// Raw upstream/SQL errors may contain the code exchange URL or identities.
		log.Printf("小程序登录失败 code=%s", code)
	}
	respond(w, result, err)
}
func (h *AccountHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.user(w, r); !ok {
		return
	}
	err := h.accounts.Logout(r.Context(), accountToken(r))
	respond(w, map[string]bool{"ok": true}, err)
}
func (h *AccountHandler) Favorites(w http.ResponseWriter, r *http.Request) {
	user, ok := h.user(w, r)
	if !ok {
		return
	}
	items, err := h.accounts.Favorites(r.Context(), user)
	respond(w, map[string]any{"items": items}, err)
}
func (h *AccountHandler) CompletedBooks(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Vary", "Authorization")
	user, ok := h.user(w, r)
	if !ok {
		return
	}
	items, err := h.accounts.CompletedBooks(r.Context(), user)
	respond(w, map[string]any{"items": items}, err)
}

func (h *AccountHandler) SetFavorites(w http.ResponseWriter, r *http.Request) {
	user, ok := h.user(w, r)
	if !ok {
		return
	}
	var input struct {
		BookIDs []string `json:"book_ids"`
		Active  *bool    `json:"active"`
	}
	if !decodeAccount(w, r, &input) {
		return
	}
	if input.Active == nil {
		Fail(w, 400, "请指定收藏状态")
		return
	}
	err := h.accounts.SetFavorites(r.Context(), user, input.BookIDs, *input.Active)
	respond(w, map[string]bool{"ok": true}, err)
}
func (h *AccountHandler) Event(w http.ResponseWriter, r *http.Request) {
	user, ok := h.user(w, r)
	if !ok {
		return
	}
	if !h.allow(r, false) {
		Fail(w, 429, "操作过于频繁，请稍后重试")
		return
	}
	var event model.ReadingEvent
	if !decodeAccount(w, r, &event) {
		return
	}
	err := h.accounts.RecordEvent(r.Context(), user, event)
	respond(w, map[string]bool{"ok": true}, err)
}

func (h *AccountHandler) Profile(w http.ResponseWriter, r *http.Request) {
	user, ok := h.user(w, r)
	if !ok {
		return
	}
	account, err := h.accounts.Profile(r.Context(), user)
	respond(w, account, err)
}
func (h *AccountHandler) SaveProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := h.user(w, r)
	if !ok {
		return
	}
	var input struct {
		Name string `json:"name"`
		Age  string `json:"age"`
	}
	if !decodeAccount(w, r, &input) {
		return
	}
	account, err := h.accounts.SaveProfile(r.Context(), user, input.Name, input.Age)
	respond(w, account, err)
}
