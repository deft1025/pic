package handler

import "net/http"

func (h *Handler) Categories(w http.ResponseWriter, r *http.Request) {
	options, err := h.library.Options(r.Context())
	respond(w, options, err)
}
