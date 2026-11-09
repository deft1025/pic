package importer

import "testing"

func TestStatusOverrideBeforeOptionalLicenseCheck(t *testing.T) {
	batch, err := Load("../../tests/fixtures/books", "../../tests/fixtures/web", "", false)
	if err != nil || len(batch.Books) != 10 || batch.Pages != 60 {
		t.Fatal("invalid initial batch", err)
	}
	for _, b := range batch.Books {
		if b.Status != "published" {
			t.Fatal("default published state changed")
		}
	}
	if _, err := Load("../../tests/fixtures/books", "../../tests/fixtures/web", "", true); err == nil {
		t.Fatal("explicit license check ignored")
	}
	batch, err = Load("../../tests/fixtures/books", "../../tests/fixtures/web", "offline", true)
	if err != nil {
		t.Fatal("offline override must precede optional license checks", err)
	}
	for _, b := range batch.Books {
		if b.Status != "offline" {
			t.Fatal("status override ignored")
		}
	}
	if _, err := Load("../../tests/fixtures/books", "../../tests/fixtures/web", "invalid", false); err == nil {
		t.Fatal("invalid status accepted")
	}
}
