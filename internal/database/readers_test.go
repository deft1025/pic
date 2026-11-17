package database

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReaderSchemaIsAdditiveAndDoesNotIncludeCatalogOrSeeds(t *testing.T) {
	statements, err := ReaderSchema("../../docs/schema.sql")
	if err != nil || len(statements) != 4 {
		t.Fatal("reader schema selection failed", err)
	}
	joined := strings.Join(statements, "\n")
	for _, forbidden := range []string{"INSERT INTO", "ALTER TABLE", "DROP ", "CREATE TABLE IF NOT EXISTS `books`"} {
		if strings.Contains(joined, forbidden) {
			t.Fatal("migration exceeds reader table scope")
		}
	}
	p := filepath.Join(t.TempDir(), "incomplete.sql")
	if err = os.WriteFile(p, []byte(statements[0]), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = ReaderSchema(p); err == nil {
		t.Fatal("incomplete migration accepted")
	}
}
