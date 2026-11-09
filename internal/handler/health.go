package handler

import "net/http"

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	health, err := h.library.Health(r.Context())
	respond(w, health, err)
}
