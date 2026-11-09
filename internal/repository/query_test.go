package repository

import (
	"reflect"
	"strings"
	"testing"

	"pic/internal/model"
)

func TestQueryUsesBoundValuesAndLiteralWildcards(t *testing.T) {
	r := New(nil, false)
	malicious := "' OR 1=1 --"
	where, args := r.where(model.Query{Q: "  100%_!  ", Age: "3-4", Category: malicious, Language: "en", IDs: []string{"one", "two"}, Featured: true})
	if strings.Contains(where, malicious) {
		t.Fatal("input interpolated into SQL")
	}
	want := []any{"3-4", malicious, "en", "one", "two", "%100!%!_!!%", "%100!%!_!!%"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args %v want %v", args, want)
	}
	if strings.Count(where, "?") != len(args) {
		t.Fatal("placeholder mismatch")
	}
	for _, clause := range []string{"b.publish_status='published'", "book_age_ranges", "book_categories", "book_languages", "b.featured_order>0", "b.book_id IN (?,?)", "ESCAPE '!'"} {
		if !strings.Contains(where, clause) {
			t.Fatal("missing", clause)
		}
	}
	if strings.Contains(where, "review_status='approved'") {
		t.Fatal("initial mode must not require approval")
	}
}
func TestExplicitApprovalAndEmptyIDs(t *testing.T) {
	where, _ := New(nil, true).where(model.Query{IDs: []string{}})
	for _, clause := range []string{"1=0", "l.review_status='approved'", "l.commercial_use=1", "l.self_hosting=1", "l.translation_allowed=1", "l.audio_derivative_allowed=1"} {
		if !strings.Contains(where, clause) {
			t.Fatal("missing", clause)
		}
	}
	if strings.Contains(orderBy("published_at; DROP TABLE books"), "DROP") {
		t.Fatal("untrusted ordering")
	}
}
