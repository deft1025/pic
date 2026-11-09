// Package handler adapts HTTP requests and responses to library use cases.
package handler

import "pic/internal/service"

type Handler struct{ library *service.Library }

func New(library *service.Library) *Handler { return &Handler{library: library} }
