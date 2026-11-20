package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/go-sql-driver/mysql"

	"pic/internal/model"
	"pic/internal/repository"
)

type identityStub struct{ err error }

func (s identityStub) Exchange(context.Context, string) (string, error) {
	return "private-openid", s.err
}

type accountsStub struct {
	hash    string
	user    string
	err     error
	ids     []string
	profile model.Account
	event   model.ReadingEvent
	calls   int
}

type favoriteLimitStub struct{ *accountsStub }

func (s favoriteLimitStub) SetFavorites(ctx context.Context, user string, ids []string, active bool) error {
	if active {
		return repository.ErrFavoriteLimit
	}
	return s.accountsStub.SetFavorites(ctx, user, ids, active)
}

func TestFavoriteLimitIsAReadableClientErrorAndDoesNotBlockRemoval(t *testing.T) {
	ctx, service, store, _ := accountService()
	service.store = favoriteLimitStub{store}
	err := service.SetFavorites(ctx, "owner", []string{"book"}, true)
	var detail *Error
	if !errors.Is(err, ErrInvalidQuery) || !errors.As(err, &detail) || detail.Code != "favorite_limit" || detail.Message != "最多收藏20本，请先取消部分收藏" {
		t.Fatal("limit was hidden as a server failure", err)
	}
	if err = service.SetFavorites(ctx, "owner", []string{"book"}, false); err != nil {
		t.Fatal("full account cannot cancel favorites", err)
	}
}

func (s *accountsStub) Login(_ context.Context, open, hash string, expires time.Time) (model.Account, error) {
	s.hash = hash
	s.user = "10000"
	s.calls++
	return model.Account{ID: s.user, Name: s.profile.Name, Age: s.profile.Age}, s.err
}
func (s *accountsStub) Authenticate(_ context.Context, hash string, _ time.Time) (string, error) {
	if s.err != nil {
		return "", s.err
	}
	if hash != s.hash {
		return "", sql.ErrNoRows
	}
	return s.user, nil
}
func (s *accountsStub) Logout(_ context.Context, hash string) error {
	if hash == s.hash {
		s.hash = ""
	}
	return nil
}
func (s *accountsStub) Favorites(context.Context, string) ([]string, error)      { return s.ids, s.err }
func (s *accountsStub) CompletedBooks(context.Context, string) ([]string, error) { return s.ids, s.err }
func (s *accountsStub) SetFavorites(_ context.Context, _ string, ids []string, _ bool) error {
	s.ids = ids
	s.calls++
	return s.err
}
func (s *accountsStub) Profile(_ context.Context, user string) (model.Account, error) {
	return model.Account{ID: user, Name: s.profile.Name, Age: s.profile.Age}, s.err
}
func (s *accountsStub) SaveProfile(_ context.Context, user, name, age string) error {
	s.profile = model.Account{ID: user, Name: name, Age: age}
	s.calls++
	return s.err
}
func (s *accountsStub) RecordEvent(_ context.Context, e model.ReadingEvent) error {
	s.event = e
	s.calls++
	return s.err
}
func accountService() (context.Context, *Accounts, *accountsStub, *storeStub) {
	repo := &accountsStub{profile: model.Account{Name: "读者", Age: "3-4"}}
	catalog := &storeStub{book: model.Book{ID: "book", Version: "v1", PageCount: 4}, options: model.Options{Ages: []model.Option{{ID: "0-2"}, {ID: "3-4"}, {ID: "5-6"}}}}
	return context.Background(), NewAccounts(repo, NewLibrary(catalog, ""), identityStub{}), repo, catalog
}
func TestAccountSessionIsOpaqueHashedRevocableAndSafe(t *testing.T) {
	ctx, s, repo, _ := accountService()
	result, err := s.Login(ctx, "one-use-code")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Token) != 64 || repo.hash == result.Token || repo.hash != tokenHash(result.Token) || result.User.ID != "10000" || time.Until(result.ExpiresAt) < 29*24*time.Hour {
		t.Fatal("insecure session")
	}
	raw, _ := json.Marshal(result)
	if strings.Contains(string(raw), "openid") || strings.Contains(string(raw), "session_key") {
		t.Fatal("wechat identity leaked")
	}
	id, err := s.Authenticate(ctx, result.Token)
	if err != nil || id != result.User.ID {
		t.Fatal("cannot authenticate")
	}
	if _, err = s.Authenticate(ctx, "bad"); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("bad token accepted")
	}
	if err = s.Logout(ctx, result.Token); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Authenticate(ctx, result.Token); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("revoked token accepted")
	}
	repo.err = errors.New("private SQL diagnostics")
	if _, err = s.Authenticate(ctx, result.Token); !errors.Is(err, ErrUnavailable) || strings.Contains(err.Error(), "SQL") {
		t.Fatal("infrastructure misclassified or leaked")
	}
}
func TestAccountChangesCheckVisibilityVersionAndBounds(t *testing.T) {
	ctx, s, repo, catalog := accountService()
	if err := s.SetFavorites(ctx, "owner", []string{"book", "book"}, true); err != nil || len(repo.ids) != 1 {
		t.Fatal("batch not deduplicated", err)
	}
	catalog.getErr = sql.ErrNoRows
	before := repo.calls
	if err := s.SetFavorites(ctx, "owner", []string{"hidden"}, true); !errors.Is(err, ErrNotFound) || repo.calls != before {
		t.Fatal("hidden book favorited")
	}
	// Removing a stale favorite remains possible after a book is taken offline.
	if err := s.SetFavorites(ctx, "owner", []string{"hidden"}, false); err != nil {
		t.Fatal(err)
	}
	catalog.getErr = nil
	e := model.ReadingEvent{ID: strings.Repeat("a", 32), ReadingID: strings.Repeat("c", 32), BookID: "book", Kind: "complete", UserID: "spoofed"}
	if err := s.RecordEvent(ctx, "owner", e); err != nil || repo.event.UserID != "owner" {
		t.Fatal("event owner is not session owner")
	}
	e.Kind = "favorite"
	if err := s.RecordEvent(ctx, "owner", e); !errors.Is(err, ErrInvalidQuery) {
		t.Fatal("unsupported event accepted")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestWeChatExchangeUsesServerSecretAndRejectsMalformedReplies(t *testing.T) {
	for _, tc := range []struct {
		status int
		body   string
		ok     bool
	}{{200, `{"openid":"private-id","session_key":"never-forward"}`, true}, {200, `{"errcode":40029,"errmsg":"secret details"}`, false}, {200, `{"session_key":"no-openid"}`, false}, {500, `{"openid":"ignore"}`, false}, {200, strings.Repeat("x", 9000), false}} {
		client := &WeChatClient{AppID: "app", Secret: "server-secret", Client: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			q := r.URL.Query()
			if r.URL.Host != "api.weixin.qq.com" || q.Get("appid") != "app" || q.Get("secret") != "server-secret" || q.Get("js_code") != "code" || q.Get("grant_type") != "authorization_code" {
				t.Fatal("incorrect code exchange")
			}
			return &http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.body))}, nil
		})}}
		id, err := client.Exchange(context.Background(), "code")
		if tc.ok != (err == nil) || tc.ok && id != "private-id" {
			t.Fatal("unexpected exchange result")
		}
		if err != nil && strings.Contains(err.Error(), "secret") {
			t.Fatal("upstream diagnostics leaked")
		}
	}
}

func TestLoginFailuresHaveDistinctSafeDiagnostics(t *testing.T) {
	for _, tc := range []struct {
		body, code string
		kind       error
	}{
		{`{"errcode":40029,"errmsg":"private details"}`, "wechat_err_40029", ErrInvalidQuery},
		{`{"errcode":40163}`, "wechat_err_40163", ErrInvalidQuery},
		{`{"errcode":40013}`, "wechat_err_40013", ErrUnavailable},
		{`{"errcode":40125}`, "wechat_err_40125", ErrUnavailable},
		{`{"errcode":45011}`, "wechat_err_45011", ErrUnavailable},
		{`{"errcode":-1}`, "wechat_err_-1", ErrUnavailable},
		{`broken`, "wechat_invalid_response", ErrUnavailable},
	} {
		t.Run(tc.code, func(t *testing.T) {
			ctx, s, _, _ := accountService()
			s.wechat = &WeChatClient{AppID: "app", Secret: "private-secret", Client: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})}}
			_, err := s.Login(ctx, "private-code")
			var failure *Error
			if !errors.As(err, &failure) || failure.Code != tc.code || !errors.Is(err, tc.kind) {
				t.Fatal("wrong diagnostic", err)
			}
			if strings.Contains(err.Error(), "private") {
				t.Fatal("private data leaked")
			}
		})
	}
	for _, tc := range []struct {
		number uint16
		code   string
	}{{1146, "reader_table_missing"}, {1054, "reader_schema_mismatch"}, {1364, "reader_schema_mismatch"}, {1040, "reader_storage_failed"}} {
		ctx, s, store, _ := accountService()
		store.err = &mysql.MySQLError{Number: tc.number, Message: "private SQL and identity"}
		_, err := s.Login(ctx, "code")
		var failure *Error
		if !errors.As(err, &failure) || failure.Code != tc.code || !errors.Is(err, ErrUnavailable) || strings.Contains(err.Error(), "private") {
			t.Fatal("storage diagnostic leaked or misclassified", err)
		}
	}
	ctx, s, _, _ := accountService()
	s.wechat = &WeChatClient{AppID: "app", Secret: "private-secret", Client: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) { return nil, errors.New("private URL secret") })}}
	_, err := s.Login(ctx, "private-code")
	var failure *Error
	if !errors.As(err, &failure) || failure.Code != "wechat_network_failed" || strings.Contains(err.Error(), "private") {
		t.Fatal("network diagnostic leaked", err)
	}
}

func TestFavoritesRejectGuestsBeforeAccessingStorage(t *testing.T) {
	ctx, svc, repo, _ := accountService()
	if _, err := svc.Favorites(ctx, ""); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("guest favorites query accepted")
	}
	if err := svc.SetFavorites(ctx, "", []string{"book"}, true); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("guest favorite accepted")
	}
	if repo.calls != 0 {
		t.Fatal("guest mutation reached storage")
	}
}

func TestFirstLoginRequiresAgeAndProfilePersistsValidatedFields(t *testing.T) {
	ctx, svc, repo, _ := accountService()
	repo.profile = model.Account{}
	session, err := svc.Login(ctx, "code")
	if err != nil || !session.User.NeedsProfile || session.User.ID != "10000" {
		t.Fatal("first login must request profile", err)
	}
	if err = svc.SetFavorites(ctx, session.User.ID, []string{"book"}, true); !errors.Is(err, ErrInvalidQuery) {
		t.Fatal("first login collected before age selection")
	}
	for _, age := range []string{"", "invalid", "7-8"} {
		if _, err = svc.SaveProfile(ctx, session.User.ID, "name", age); !errors.Is(err, ErrInvalidQuery) {
			t.Fatal("invalid age accepted")
		}
	}
	for _, name := range []string{strings.Repeat("名", 51), "line\nbreak"} {
		if _, err = svc.SaveProfile(ctx, session.User.ID, name, "3-4"); !errors.Is(err, ErrInvalidQuery) {
			t.Fatal("invalid name accepted")
		}
	}
	profile, err := svc.SaveProfile(ctx, session.User.ID, "  ", "3-4")
	if err != nil || profile.Name != "小小读者" || profile.Age != "3-4" || profile.NeedsProfile {
		t.Fatal("profile not completed", err)
	}
	again, err := svc.Login(ctx, "new-code")
	if err != nil || again.User.ID != session.User.ID || again.User.NeedsProfile || again.User.Name != "小小读者" {
		t.Fatal("returning account lost profile", err)
	}
	if _, err = svc.SaveProfile(ctx, "", "name", "3-4"); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("guest changed profile")
	}
}
func TestReadingEventsRejectGuestsBeforeAccessingStorage(t *testing.T) {
	ctx, svc, repo, _ := accountService()
	e := model.ReadingEvent{ID: strings.Repeat("a", 32), BookID: "book", Kind: "open", ReadingID: strings.Repeat("b", 32)}
	if err := svc.RecordEvent(ctx, "", e); !errors.Is(err, ErrUnauthorized) || repo.calls != 0 {
		t.Fatal("guest reading event was stored")
	}
}

func TestCompletedBooksRequiresAccountAndPropagatesStorageFailure(t *testing.T) {
	ctx := context.Background()
	svc := NewAccounts(nil, nil, nil)
	if _, err := svc.CompletedBooks(ctx, ""); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("guest could access completed books", err)
	}
	repo := &accountsStub{ids: []string{"finished-book"}}
	svc = NewAccounts(repo, nil, nil)
	ids, err := svc.CompletedBooks(ctx, "owner")
	if err != nil || len(ids) != 1 || ids[0] != "finished-book" {
		t.Fatal(ids, err)
	}
	repo.err = errors.New("storage down")
	if _, err = svc.CompletedBooks(ctx, "owner"); !errors.Is(err, ErrUnavailable) {
		t.Fatal("lost storage failure", err)
	}
}
