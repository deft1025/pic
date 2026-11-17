// Package handler adapts HTTP requests and responses to library use cases.
package handler

import "pic/internal/service"

type Handler struct {
	library     *service.Library
	siteBaseURL string
	accounts    *service.Accounts
}

func New(library *service.Library, siteBaseURL string, accounts ...*service.Accounts) *Handler {
	h := &Handler{library: library, siteBaseURL: siteBaseURL}
	if len(accounts) > 0 {
		h.accounts = accounts[0]
	}
	return h
}
