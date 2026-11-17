package model

// RecommendationCandidate is internal ranking data, never a client-supplied profile.
type RecommendationCandidate struct {
	BookID    string
	Sequence  uint64
	Score     uint64
	AgeMatch  bool
	Completed bool
}
