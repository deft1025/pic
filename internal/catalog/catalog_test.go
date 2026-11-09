package catalog

import (
	"testing"

	"pic/internal/model"
)

func TestEarlyPublishingAndOptionalApproval(t *testing.T) {
	c, err := Load("../../tests/fixtures/books", "../../tests/fixtures/web", false)
	if err != nil {
		t.Fatal(err)
	}
	b := c.Books[0]
	if b.Status != "published" || b.License.ReviewStatus != "pending" {
		t.Fatal("seed should preserve requested initial publishing behavior")
	}
	if err := Validate(b, false); err != nil {
		t.Fatal("initial publishing should not require approval", err)
	}
	if err := Validate(b, true); err == nil {
		t.Fatal("explicit approval mode must reject pending content")
	}
	b.License.ReviewStatus = "approved"
	b.License.CommercialUse = true
	b.License.SelfHosting = true
	b.License.TranslationAllowed = true
	b.License.AudioDerivativeAllowed = true
	if err := Validate(b, true); err != nil {
		t.Fatal(err)
	}
}
func TestBrokenPageRejected(t *testing.T) {
	c, err := Load("../../tests/fixtures/books", "../../tests/fixtures/web", false)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		modify func(*model.Book)
	}{
		{"wrong page count", func(b *model.Book) { b.PageCount++ }},
		{"missing translated text", func(b *model.Book) { b.Pages[0].TextZH = "" }},
		{"wrong sequence", func(b *model.Book) { b.Pages[0].Number = 8 }},
		{"path traversal", func(b *model.Book) { b.Cover = "/assets/../../.env" }},
		{"encoded traversal", func(b *model.Book) { b.Cover = "/assets/%2e%2e/private.svg" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := c.Books[0]
			b.Pages = append([]model.Page(nil), b.Pages...)
			tc.modify(&b)
			if Validate(b, false) == nil {
				t.Fatal("invalid content accepted")
			}
		})
	}
}
