package model

type Query struct {
	Q, Age, Category, Language, Sort string
	Offset, Limit                    int
	IDs                              []string
	Featured                         bool
}

type Options struct {
	Ages       []Option `json:"ages"`
	Categories []Option `json:"categories"`
	Languages  []Option `json:"languages"`
}
