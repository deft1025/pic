// Package service implements library use cases independently of HTTP routing.
package service

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"pic/internal/model"
	"pic/internal/repository"
)

type Library struct {
	store        repository.Store
	assetBaseURL string
}

func NewLibrary(store repository.Store, assetBaseURL string) *Library {
	return &Library{store: store, assetBaseURL: strings.TrimRight(assetBaseURL, "/")}
}

// Asset paths stay portable in storage; only API responses use the deployment URL.
func (s *Library) assetURL(path string) string {
	if s.assetBaseURL != "" && strings.HasPrefix(path, "/assets/") {
		return s.assetBaseURL + path
	}
	return path
}

type BookList struct {
	Items  []model.Book `json:"items"`
	Total  int          `json:"total"`
	Offset int          `json:"offset"`
	Limit  int          `json:"limit"`
}

type BookPages struct {
	BookID         string       `json:"book_id"`
	ContentVersion string       `json:"content_version"`
	Items          []model.Page `json:"items"`
	Total          int          `json:"total"`
}

type Health struct {
	Status         string `json:"status"`
	Storage        string `json:"storage"`
	PublishedBooks int    `json:"published_books"`
}

func (s *Library) List(ctx context.Context, q model.Query) (BookList, error) {
	if q.Limit == 0 {
		q.Limit = DefaultLimit
	}
	if q.Limit < 1 || q.Limit > MaxLimit {
		return BookList{}, &Error{Kind: ErrInvalidQuery, Message: "limit 必须为 1–100"}
	}
	if q.Offset < 0 {
		return BookList{}, &Error{Kind: ErrInvalidQuery, Message: "offset 必须是非负整数"}
	}
	if len(q.Q) > 300 {
		return BookList{}, &Error{Kind: ErrInvalidQuery, Message: "搜索关键词过长"}
	}
	items, total, err := s.store.List(ctx, q)
	if err != nil {
		return BookList{}, &Error{Kind: ErrUnavailable, Message: "暂时无法查询绘本，请稍后重试", Cause: err}
	}
	if items == nil {
		items = []model.Book{}
	}
	items = append([]model.Book{}, items...)
	// Lists and details never ship the whole reader payload.
	for i := range items {
		items[i].Pages = nil
		items[i].Cover = s.assetURL(items[i].Cover)
	}
	return BookList{Items: items, Total: total, Offset: q.Offset, Limit: q.Limit}, nil
}

func (s *Library) Book(ctx context.Context, id string) (model.Book, error) {
	book, err := s.store.Get(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Book{}, &Error{Kind: ErrNotFound, Message: "这本绘本暂时找不到了", Cause: err}
	}
	if err != nil {
		return model.Book{}, &Error{Kind: ErrUnavailable, Message: "暂时无法读取绘本，请稍后重试", Cause: err}
	}
	book.Pages = nil
	book.Cover = s.assetURL(book.Cover)
	return book, nil
}

func (s *Library) Pages(ctx context.Context, id string) (BookPages, error) {
	book, err := s.Book(ctx, id)
	if err != nil {
		return BookPages{}, err
	}
	pages, err := s.store.Pages(ctx, book.ID)
	if err != nil {
		return BookPages{}, &Error{Kind: ErrUnavailable, Message: "暂时无法读取页面，请稍后重试", Cause: err}
	}
	if pages == nil {
		pages = []model.Page{}
	}
	pages = append([]model.Page{}, pages...)
	for i := range pages {
		pages[i].Image = s.assetURL(pages[i].Image)
		pages[i].AudioZH = s.assetURL(pages[i].AudioZH)
		pages[i].AudioOriginal = s.assetURL(pages[i].AudioOriginal)
	}
	return BookPages{BookID: book.ID, ContentVersion: book.Version, Items: pages, Total: len(pages)}, nil
}

func (s *Library) Options(ctx context.Context) (model.Options, error) {
	options, err := s.store.Options(ctx)
	if err != nil {
		return model.Options{}, &Error{Kind: ErrUnavailable, Message: "暂时无法读取分类，请稍后重试", Cause: err}
	}
	return options, nil
}

func (s *Library) Health(ctx context.Context) (Health, error) {
	if err := s.store.Ping(ctx); err != nil {
		return Health{}, &Error{Kind: ErrUnavailable, Message: "MySQL 暂时不可用", Cause: err}
	}
	_, total, err := s.store.List(ctx, model.Query{Limit: 1})
	if err != nil {
		return Health{}, &Error{Kind: ErrUnavailable, Message: "内容表暂时不可用，请确认已初始化数据库", Cause: err}
	}
	return Health{Status: "ok", Storage: "mysql", PublishedBooks: total}, nil
}
