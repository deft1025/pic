package handler

import (
	"net/http"
	"strings"

	"pic/internal/model"
	"pic/internal/service"
)

func (h *Handler) Books(w http.ResponseWriter, r *http.Request) {
	v := r.URL.Query()
	limit, offset, err := service.ParsePage(v.Get("limit"), v.Get("offset"))
	if err != nil {
		respond(w, nil, err)
		return
	}
	q := model.Query{Q: v.Get("q"), Age: v.Get("age"), Category: v.Get("category"), Language: v.Get("language"), Sort: v.Get("sort"), Offset: offset, Limit: limit, Featured: v.Get("featured") == "true"}
	if v.Has("ids") {
		q.IDs = strings.Split(v.Get("ids"), ",")
	}
	result, err := h.library.List(r.Context(), q)
	respond(w, result, err)
}
func (h *Handler) Book(w http.ResponseWriter, r *http.Request) {
	book, err := h.library.Book(r.Context(), r.PathValue("id"))
	respond(w, book, err)
}
func (h *Handler) Pages(w http.ResponseWriter, r *http.Request) {
	pages, err := h.library.Pages(r.Context(), r.PathValue("id"))
	respond(w, pages, err)
}
