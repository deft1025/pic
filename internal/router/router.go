// Package router registers endpoints and shared HTTP middleware.
package router

import (
	"net/http"

	"pic/internal/handler"
	"pic/internal/service"
	"pic/internal/web"
)

func New(library *service.Library, webDir, assetBaseURL, siteBaseURL string, accounts ...*service.Accounts) http.Handler {
	mux := http.NewServeMux()
	var account *service.Accounts
	if len(accounts) > 0 {
		account = accounts[0]
	}
	a := handler.NewAccounts(account)
	mux.HandleFunc("POST /api/auth/wechat", a.Login)
	mux.HandleFunc("POST /api/auth/logout", a.Logout)
	mux.HandleFunc("GET /api/me/profile", a.Profile)
	mux.HandleFunc("PUT /api/me/profile", a.SaveProfile)
	mux.HandleFunc("GET /api/me/favorites", a.Favorites)
	mux.HandleFunc("PUT /api/me/favorites", a.SetFavorites)
	mux.HandleFunc("POST /api/events", a.Event)
	h := handler.New(library, siteBaseURL, account)
	mux.HandleFunc("GET /sitemap.xml", h.Sitemap)
	mux.HandleFunc("GET /api/health", h.Health)
	mux.HandleFunc("GET /api/books", h.Books)
	mux.HandleFunc("GET /api/search", h.Books)
	mux.HandleFunc("GET /api/categories", h.Categories)
	mux.HandleFunc("GET /api/recommendations", h.Recommendations)
	mux.HandleFunc("GET /api/books/{id}", h.Book)
	mux.HandleFunc("GET /api/books/{id}/pages", h.Pages)
	mux.HandleFunc("GET /api/", func(w http.ResponseWriter, r *http.Request) { handler.Fail(w, http.StatusNotFound, "接口不存在") })
	mux.Handle("GET /", web.Handler(webDir))
	return SecurityHeaders(Recovery(mux), assetBaseURL)
}
