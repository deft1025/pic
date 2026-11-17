package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"pic/internal/model"
	"pic/internal/repository"
)

var ErrUnauthorized = errors.New("authentication required")
var opaqueID = regexp.MustCompile(`^[a-f0-9]{32}$`)
var businessID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

type WeChatIdentity interface {
	Exchange(context.Context, string) (string, error)
}
type WeChatClient struct {
	AppID, Secret string
	Client        *http.Client
}

func (c *WeChatClient) Exchange(ctx context.Context, code string) (string, error) {
	if c.AppID == "" || c.Secret == "" {
		return "", errors.New("wechat not configured")
	}
	q := url.Values{"appid": {c.AppID}, "secret": {c.Secret}, "js_code": {code}, "grant_type": {"authorization_code"}}
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.weixin.qq.com/sns/jscode2session?"+q.Encode(), nil)
	if err != nil {
		return "", err
	}
	client := c.Client
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	res, err := client.Do(req)
	if err != nil {
		return "", errors.New("wechat unavailable")
	}
	defer res.Body.Close()
	var data struct {
		OpenID string `json:"openid"`
		Error  int    `json:"errcode"`
	}
	if res.StatusCode != 200 {
		return "", errors.New("wechat unavailable")
	}
	if err = json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&data); err != nil || data.Error != 0 || data.OpenID == "" || len(data.OpenID) > 128 {
		return "", errors.New("wechat login rejected")
	}
	return data.OpenID, nil
}

type Accounts struct {
	store   repository.AccountStore
	library *Library
	wechat  WeChatIdentity
	appID   string
}

func NewAccounts(store repository.AccountStore, library *Library, wechat WeChatIdentity, appID string) *Accounts {
	return &Accounts{store, library, wechat, appID}
}
func accountUnavailable(err error) error {
	if err == nil {
		return nil
	}
	return &Error{Kind: ErrUnavailable, Message: "账号服务暂时不可用，请稍后重试", Cause: err}
}
func invalidAccount(message string) error { return &Error{Kind: ErrInvalidQuery, Message: message} }
func unauthorized() error                 { return &Error{Kind: ErrUnauthorized, Message: "请重新登录"} }
func randomID(n int) (string, error) {
	b := make([]byte, n)
	_, err := rand.Read(b)
	return hex.EncodeToString(b), err
}
func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
func (s *Accounts) Login(ctx context.Context, code string) (model.AccountSession, error) {
	if len(code) < 1 || len(code) > 256 || strings.TrimSpace(code) != code {
		return model.AccountSession{}, invalidAccount("登录凭证无效")
	}
	open, err := s.wechat.Exchange(ctx, code)
	if err != nil {
		return model.AccountSession{}, accountUnavailable(err)
	}
	token, err := randomID(32)
	if err != nil {
		return model.AccountSession{}, accountUnavailable(err)
	}
	expiry := time.Now().UTC().Add(30 * 24 * time.Hour)
	account, err := s.store.Login(ctx, s.appID, open, tokenHash(token), expiry)
	if err != nil {
		return model.AccountSession{}, accountUnavailable(err)
	}
	account.NeedsProfile = account.Age == ""
	return model.AccountSession{Token: token, ExpiresAt: expiry, User: account}, nil
}
func (s *Accounts) Authenticate(ctx context.Context, token string) (string, error) {
	if len(token) != 64 {
		return "", unauthorized()
	}
	if _, err := hex.DecodeString(token); err != nil {
		return "", unauthorized()
	}
	id, err := s.store.Authenticate(ctx, tokenHash(token), time.Now().UTC())
	if errors.Is(err, sql.ErrNoRows) {
		return "", unauthorized()
	}
	return id, accountUnavailable(err)
}
func (s *Accounts) Logout(ctx context.Context, token string) error {
	return accountUnavailable(s.store.Logout(ctx, tokenHash(token)))
}
func (s *Accounts) Profile(ctx context.Context, user string) (model.Account, error) {
	if user == "" {
		return model.Account{}, unauthorized()
	}
	account, err := s.store.Profile(ctx, user)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Account{}, unauthorized()
	}
	if err != nil {
		return model.Account{}, accountUnavailable(err)
	}
	account.NeedsProfile = account.Age == ""
	return account, nil
}
func (s *Accounts) SaveProfile(ctx context.Context, user, name, age string) (model.Account, error) {
	if user == "" {
		return model.Account{}, unauthorized()
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = "小小读者"
	}
	if utf8.RuneCountInString(name) > 50 || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return model.Account{}, invalidAccount("用户名最多50个字，不能包含换行或控制字符")
	}
	options, err := s.library.Options(ctx)
	if err != nil {
		return model.Account{}, err
	}
	valid := false
	for _, option := range options.Ages {
		if option.ID == age {
			valid = true
			break
		}
	}
	if !valid {
		return model.Account{}, invalidAccount("请选择有效的年龄段")
	}
	if _, err = s.Profile(ctx, user); err != nil {
		return model.Account{}, err
	}
	if err = s.store.SaveProfile(ctx, user, name, age); err != nil {
		return model.Account{}, accountUnavailable(err)
	}
	return s.Profile(ctx, user)
}
func (s *Accounts) Favorites(ctx context.Context, user string) ([]string, error) {
	if user == "" {
		return nil, unauthorized()
	}
	ids, err := s.store.Favorites(ctx, user)
	if err != nil {
		return nil, accountUnavailable(err)
	}
	visible := []string{}
	for _, id := range ids {
		_, err = s.library.Book(ctx, id)
		if errors.Is(err, ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		visible = append(visible, id)
	}
	return visible, nil
}
func (s *Accounts) SetFavorites(ctx context.Context, user string, ids []string, active bool) error {
	if user == "" {
		return unauthorized()
	}
	if active {
		account, err := s.Profile(ctx, user)
		if err != nil {
			return err
		}
		if account.NeedsProfile {
			return invalidAccount("请先选择年龄段")
		}
	}
	if len(ids) == 0 || len(ids) > 100 {
		return invalidAccount("每次收藏操作限1–100本")
	}
	unique := map[string]bool{}
	ordered := []string{}
	for _, id := range ids {
		if !businessID.MatchString(id) {
			return invalidAccount("绘本标识无效")
		}
		if unique[id] {
			continue
		}
		unique[id] = true
		ordered = append(ordered, id)
		if active {
			if _, err := s.library.Book(ctx, id); err != nil {
				return err
			}
		}
	}
	sort.Strings(ordered)
	return accountUnavailable(s.store.SetFavorites(ctx, user, ordered, active))
}
func (s *Accounts) RecordEvent(ctx context.Context, user string, e model.ReadingEvent) error {
	if user == "" {
		return unauthorized()
	}
	if !opaqueID.MatchString(e.ID) || !opaqueID.MatchString(e.ReadingID) || (e.Kind != "open" && e.Kind != "complete") {
		return invalidAccount("阅读事件无效")
	}
	if _, err := s.library.Book(ctx, e.BookID); err != nil {
		return err
	}
	e.UserID = user
	return accountUnavailable(s.store.RecordEvent(ctx, e))
}
