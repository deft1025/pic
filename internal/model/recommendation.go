package model

// RecommendationCandidate is internal ranking data, never a client-supplied profile.
type RecommendationCandidate struct {
	BookID    string
	Sequence  uint64
	Score     uint64
	AgeMatch  bool
	Completed bool
}

// RecommendationRecord is the last batch for one account, never a guest record.
type RecommendationRecord struct {
	BookIDs []string
	Date    string
}
