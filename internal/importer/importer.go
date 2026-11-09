// Package importer prepares validated content batches before database writes.
package importer

import (
	"fmt"

	"pic/internal/catalog"
	"pic/internal/model"
)

type Batch struct {
	Books []model.Book
	Pages int
}

func Load(contentDir, webDir, status string, strict bool) (*Batch, error) {
	c, err := catalog.Load(contentDir, webDir, false)
	if err != nil {
		return nil, err
	}
	return prepare(c, status, strict)
}

func LoadWithAssets(contentDir, status string, strict bool, check func([]string) error) (*Batch, error) {
	// An explicit offline/draft override is applied before optional license checks.
	c, err := catalog.LoadWithAssets(contentDir, false, check)
	if err != nil {
		return nil, err
	}
	return prepare(c, status, strict)
}

func prepare(c *catalog.Catalog, status string, strict bool) (*Batch, error) {
	batch := &Batch{Books: c.Books}
	for i := range batch.Books {
		if status != "" {
			batch.Books[i].Status = status
		}
		if err := catalog.Validate(batch.Books[i], strict); err != nil {
			return nil, fmt.Errorf("%s: %w", batch.Books[i].ID, err)
		}
		batch.Pages += len(batch.Books[i].Pages)
	}
	return batch, nil
}
