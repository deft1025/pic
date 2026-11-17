package model

import "time"

type Account struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Age          string `json:"age"`
	NeedsProfile bool   `json:"needs_profile"`
}
type AccountSession struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	User      Account   `json:"user"`
}
type ReadingEvent struct {
	ID        string `json:"event_id"`
	BookID    string `json:"book_id"`
	Kind      string `json:"kind"`
	ReadingID string `json:"reading_id"`
	UserID    string `json:"-"`
}
