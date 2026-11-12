// Package router registers endpoints and shared HTTP middleware.
package router

import (
	"net/http"

	"pic/internal/handler"
	"pic/internal/service"
	"pic/internal/web"
)

func New(library *service.Library, webDir, assetBaseURL, siteBaseURL string) http.Handler {
	mux := http.NewServeMux()
	h := handler.New(library, siteBaseURL)
	mux.HandleFunc("GET /sitemap.xml", h.Sitemap)
	mux.HandleFunc("GET /api/health", h.Health)
	mux.HandleFunc("GET /api/books", h.Books)
	mux.HandleFunc("GET /api/search", h.Books)
	mux.HandleFunc("GET /api/categories", h.Categories)
	mux.HandleFunc("GET /api/books/{id}", h.Book)
	mux.HandleFunc("GET /api/books/{id}/pages", h.Pages)
	mux.HandleFunc("GET /api/", func(w http.ResponseWriter, r *http.Request) { handler.Fail(w, http.StatusNotFound, "接口不存在") })
	mux.Handle("GET /", web.Handler(webDir))
	return SecurityHeaders(Recovery(mux), assetBaseURL)
}
