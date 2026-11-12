package service

import (
	"context"
	"net/url"
)

// SitemapPaths lists public discovery pages. Browser-specific shelves, search
// parameters and alternate reader layouts are deliberately omitted.
func (s *Library) SitemapPaths(ctx context.Context) ([]string, error) {
	ids, err := s.store.PublishedBookIDs(ctx)
	if err != nil {
		return nil, &Error{Kind: ErrUnavailable, Message: "暂时无法生成站点地图，请稍后重试", Cause: err}
	}
	paths := []string{"/", "/books", "/about", "/copyright", "/privacy"}
	for _, id := range ids {
		paths = append(paths, "/book/"+url.PathEscape(id))
	}
	return paths, nil
}
