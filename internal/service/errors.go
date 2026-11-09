package service

import "errors"

var (
	ErrInvalidQuery = errors.New("invalid query")
	ErrNotFound     = errors.New("book not found")
	ErrUnavailable  = errors.New("content unavailable")
)

// Error exposes a reader-facing message while preserving its cause for callers.
// No SQL, credentials or driver diagnostics are sent to the reader.
type Error struct {
	Kind    error
	Message string
	Cause   error
}

func (e *Error) Error() string        { return e.Message }
func (e *Error) Unwrap() error        { return e.Cause }
func (e *Error) Is(target error) bool { return target == e.Kind }
