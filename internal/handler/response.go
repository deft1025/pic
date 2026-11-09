package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"pic/internal/service"
)

func JSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func Fail(w http.ResponseWriter, status int, message string) {
	JSON(w, status, map[string]string{"error": message})
}
func respond(w http.ResponseWriter, value any, err error) {
	if err == nil {
		JSON(w, http.StatusOK, value)
		return
	}
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, service.ErrInvalidQuery):
		status = http.StatusBadRequest
	case errors.Is(err, service.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, service.ErrUnavailable):
		status = http.StatusServiceUnavailable
	}
	message := "服务暂时不可用，请稍后重试"
	var public *service.Error
	if errors.As(err, &public) {
		message = public.Message
	}
	Fail(w, status, message)
}
