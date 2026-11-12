// Package handler adapts HTTP requests and responses to library use cases.
package handler

import "pic/internal/service"

type Handler struct {
	library     *service.Library
	siteBaseURL string
}

func New(library *service.Library, siteBaseURL string) *Handler {
	return &Handler{library: library, siteBaseURL: siteBaseURL}
}
