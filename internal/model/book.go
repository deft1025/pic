// Package model defines the shared content types, independent of HTTP and storage.
package model

type License struct {
	Type                   string `json:"type"`
	SourceURL              string `json:"source_url"`
	URL                    string `json:"license_url"`
	Attribution            string `json:"attribution"`
	ReviewStatus           string `json:"review_status"`
	CommercialUse          bool   `json:"commercial_use"`
	SelfHosting            bool   `json:"self_hosting"`
	TranslationAllowed     bool   `json:"translation_allowed"`
	AudioDerivativeAllowed bool   `json:"audio_derivative_allowed"`
}

type Voice struct {
	Provider     string `json:"provider"`
	VoiceID      string `json:"voice_id"`
	GeneratedAt  string `json:"generated_at"`
	ReviewStatus string `json:"review_status"`
}

type Page struct {
	Number        int    `json:"page_number"`
	Image         string `json:"image"`
	ImageAlt      string `json:"image_alt"`
	TextZH        string `json:"text_zh"`
	TextOriginal  string `json:"text_original"`
	AudioZH       string `json:"audio_zh,omitempty"`
	AudioOriginal string `json:"audio_original,omitempty"`
}

type Book struct {
	ID            string           `json:"id"`
	TitleZH       string           `json:"title_zh"`
	TitleOriginal string           `json:"title_original"`
	Author        string           `json:"author"`
	Illustrator   string           `json:"illustrator"`
	Description   string           `json:"description_zh"`
	Ages          []string         `json:"age_ranges"`
	Categories    []string         `json:"categories"`
	Languages     []string         `json:"languages"`
	Cover         string           `json:"cover"`
	PageCount     int              `json:"page_count"`
	Minutes       int              `json:"reading_minutes"`
	Featured      int              `json:"featured_order"`
	PublishedAt   string           `json:"published_at"`
	Status        string           `json:"publish_status"`
	Version       string           `json:"content_version"`
	IsDemo        bool             `json:"is_demo"`
	License       License          `json:"license"`
	Voices        map[string]Voice `json:"voices,omitempty"`
	Pages         []Page           `json:"pages,omitempty"`
}

type Option struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}
