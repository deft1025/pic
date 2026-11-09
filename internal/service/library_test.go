package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"pic/internal/model"
)

type storeStub struct {
	listCalls, pageCalls                           int
	query                                          model.Query
	book                                           model.Book
	listErr, getErr, pagesErr, pingErr, optionsErr error
}

func (s *storeStub) Ping(context.Context) error { return s.pingErr }
func (s *storeStub) List(_ context.Context, q model.Query) ([]model.Book, int, error) {
	s.listCalls++
	s.query = q
	return []model.Book{s.book}, 7, s.listErr
}
func (s *storeStub) Get(context.Context, string) (model.Book, error) { return s.book, s.getErr }
func (s *storeStub) Pages(context.Context, string) ([]model.Page, error) {
	s.pageCalls++
	return s.book.Pages, s.pagesErr
}
func (s *storeStub) Options(context.Context) (model.Options, error) {
	return model.Options{}, s.optionsErr
}

func TestParsePage(t *testing.T) {
	for _, tc := range []struct {
		limit, offset         string
		wantLimit, wantOffset int
		bad                   bool
	}{
		{"", "", 24, 0, false}, {"100", "2", 100, 2, false}, {"0", "", 0, 0, true}, {"101", "", 0, 0, true}, {"abc", "", 0, 0, true}, {"1", "-1", 0, 0, true}, {"1", "abc", 0, 0, true},
	} {
		limit, offset, err := ParsePage(tc.limit, tc.offset)
		if tc.bad {
			if !errors.Is(err, ErrInvalidQuery) {
				t.Fatal("invalid pagination accepted")
			}
			continue
		}
		if err != nil || limit != tc.wantLimit || offset != tc.wantOffset {
			t.Fatal("incorrect pagination", limit, offset, err)
		}
	}
}
func TestListValidatesBeforeReadingAndKeepsPayloadSmall(t *testing.T) {
	store := &storeStub{book: model.Book{ID: "one", Pages: []model.Page{{Number: 1}}}}
	svc := NewLibrary(store, "")
	for _, q := range []model.Query{{Limit: -1}, {Limit: 101}, {Offset: -1}, {Q: strings.Repeat("a", 301)}} {
		if _, err := svc.List(context.Background(), q); !errors.Is(err, ErrInvalidQuery) {
			t.Fatal("invalid query accepted")
		}
	}
	if store.listCalls != 0 {
		t.Fatal("invalid requests reached storage")
	}
	result, err := svc.List(context.Background(), model.Query{Offset: 3, IDs: []string{}})
	if err != nil || result.Limit != 24 || result.Offset != 3 || result.Total != 7 || store.query.IDs == nil || len(result.Items[0].Pages) != 0 {
		t.Fatal("list defaults, IDs or payload changed", err)
	}
}
func TestPagesCheckVisibilityAndKeepVersion(t *testing.T) {
	store := &storeStub{getErr: sql.ErrNoRows}
	svc := NewLibrary(store, "")
	if _, err := svc.Pages(context.Background(), "missing"); !errors.Is(err, ErrNotFound) {
		t.Fatal("missing book was not classified")
	}
	if store.pageCalls != 0 {
		t.Fatal("pages queried for invisible book")
	}
	store.getErr = nil
	store.book = model.Book{ID: "one", Version: "v2", Pages: []model.Page{{Number: 1}}}
	result, err := svc.Pages(context.Background(), "one")
	if err != nil || result.BookID != "one" || result.ContentVersion != "v2" || result.Total != 1 {
		t.Fatal("page response lost content/version", err)
	}
	book, err := svc.Book(context.Background(), "one")
	if err != nil || len(book.Pages) != 0 {
		t.Fatal("detail ships full pages")
	}
}
func TestInfrastructureFailuresKeepCausesPrivate(t *testing.T) {
	cause := errors.New("private SQL diagnostics and credentials")
	store := &storeStub{listErr: cause, getErr: cause, pingErr: cause, optionsErr: cause}
	svc := NewLibrary(store, "")
	_, a := svc.List(context.Background(), model.Query{})
	_, b := svc.Book(context.Background(), "one")
	_, c := svc.Options(context.Background())
	_, d := svc.Health(context.Background())
	store.getErr = nil
	store.pagesErr = cause
	_, e := svc.Pages(context.Background(), "one")
	store.pingErr = nil
	_, f := svc.Health(context.Background())
	for _, err := range []error{a, b, c, d, e, f} {
		if !errors.Is(err, ErrUnavailable) || !errors.Is(err, cause) || strings.Contains(err.Error(), "private") {
			t.Fatal("error classification/redaction lost", err)
		}
	}
}
func TestHealthReportsLivePublishedCount(t *testing.T) {
	store := &storeStub{}
	result, err := NewLibrary(store, "").Health(context.Background())
	if err != nil || result.PublishedBooks != 7 || result.Storage != "mysql" || store.query.Limit != 1 {
		t.Fatal("health is not reading live storage", err)
	}
}

func TestExternalAssetsPreserveStorageAndLocalMode(t *testing.T) {
	store := &storeStub{book: model.Book{
		ID: "one", Cover: "/assets/books/one/cover.svg",
		Pages: []model.Page{
			{Number: 1, Image: "/assets/books/one/001.svg", AudioZH: "/assets/books/one/zh.mp3", AudioOriginal: "/assets/books/one/en.mp3"},
			{Number: 2, Image: "/assets/books/one/002.svg"},
		},
	}}
	ctx := context.Background()
	svc := NewLibrary(store, "https://media.example.com/pic/")
	list, err := svc.List(ctx, model.Query{})
	if err != nil || list.Items[0].Cover != "https://media.example.com/pic/assets/books/one/cover.svg" || len(list.Items[0].Pages) != 0 {
		t.Fatal("list asset URL or payload incorrect", err)
	}
	book, err := svc.Book(ctx, "one")
	if err != nil || book.Cover != list.Items[0].Cover {
		t.Fatal("detail asset URL incorrect", err)
	}
	for range 2 {
		pages, err := svc.Pages(ctx, "one")
		if err != nil || pages.Items[0].Image != "https://media.example.com/pic/assets/books/one/001.svg" || pages.Items[0].AudioZH != "https://media.example.com/pic/assets/books/one/zh.mp3" || pages.Items[0].AudioOriginal != "https://media.example.com/pic/assets/books/one/en.mp3" || pages.Items[1].AudioZH != "" {
			t.Fatal("page assets incorrect or repeated requests mutate stored paths", err)
		}
	}
	local, err := NewLibrary(store, "").Pages(ctx, "one")
	if err != nil || local.Items[0] != store.book.Pages[0] || !strings.HasPrefix(local.Items[0].Image, "/assets/") {
		t.Fatal("local paths changed by external response mapping", err)
	}
}
