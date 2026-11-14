package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"pic/internal/catalog"
	"pic/internal/model"
	"pic/internal/repository"
)

type MaterialStore interface {
	Material(context.Context, string) (repository.MaterialSnapshot, error)
	MaterialIDs(context.Context) ([]string, error)
	SaveMaterial(context.Context, model.Book, string) error
}

// Materials serves local production commands only; it adds no HTTP write route.
type Materials struct {
	store  MaterialStore
	strict bool
}

func NewMaterials(store MaterialStore, strict bool) *Materials {
	return &Materials{store: store, strict: strict}
}
func (s *Materials) Read(ctx context.Context, id string) (repository.MaterialSnapshot, error) {
	return s.store.Material(ctx, id)
}
func (s *Materials) IDs(ctx context.Context) ([]string, error) { return s.store.MaterialIDs(ctx) }

func (s *Materials) Validate(b model.Book, check func([]string) error) error {
	if b.Status == "published" && strings.TrimSpace(b.ReadingValue) == "" {
		return fmt.Errorf("已发布物料必须包含推荐理由 reading_value，请根据故事内容填写一句短句")
	}
	if err := catalog.Validate(b, s.strict); err != nil {
		return err
	}
	if check == nil {
		return nil
	}
	paths := []string{b.Cover}
	for _, p := range b.Pages {
		paths = append(paths, p.Image)
		if p.AudioZH != "" {
			paths = append(paths, p.AudioZH)
		}
		if p.AudioOriginal != "" {
			paths = append(paths, p.AudioOriginal)
		}
	}
	return check(paths)
}

// Save clears stale generated speech and typography after edits, validates the
// complete book, then commits with an optimistic revision check under a row lock.
func (s *Materials) Save(ctx context.Context, next repository.MaterialSnapshot, check func([]string) error) error {
	next.Book.ReadingValue = strings.TrimSpace(next.Book.ReadingValue)
	current, err := s.store.Material(ctx, next.Book.ID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	if errors.Is(err, sql.ErrNoRows) {
		if next.Revision != "" {
			return repository.ErrMaterialConflict
		}
	} else {
		if next.Revision == "" || current.Revision != next.Revision {
			return repository.ErrMaterialConflict
		}
		invalidateMaterialSpeech(&next.Book, current.Book)
	}
	if next.Book.Version == "" || next.Book.Version == current.Book.Version {
		b := next.Book
		b.Version = ""
		data, e := json.Marshal(b)
		if e != nil {
			return e
		}
		next.Book.Version = fmt.Sprintf("materials-%x", sha256.Sum256(data))
	}
	if err = s.Validate(next.Book, check); err != nil {
		return err
	}
	return s.store.SaveMaterial(ctx, next.Book, next.Revision)
}

func invalidateMaterialSpeech(next *model.Book, old model.Book) {
	zhChanged, enChanged := len(next.Pages) != len(old.Pages), len(next.Pages) != len(old.Pages)
	for i, p := range next.Pages {
		if i >= len(old.Pages) {
			break
		}
		previous := old.Pages[i]
		zhChanged = zhChanged || p.Number != previous.Number || p.TextZH != previous.TextZH
		enChanged = enChanged || p.Number != previous.Number || p.TextOriginal != previous.TextOriginal
		if (p.TextZH != previous.TextZH || p.TextOriginal != previous.TextOriginal) && catalog.ValidateDialogue(p, next.Languages) != nil {
			next.Pages[i].Dialogue = nil
		}
	}
	if zhChanged {
		delete(next.Voices, "zh")
	}
	if enChanged {
		delete(next.Voices, "en")
	}
	for i := range next.Pages {
		if zhChanged {
			next.Pages[i].AudioZH = ""
		}
		if enChanged {
			next.Pages[i].AudioOriginal = ""
		}
	}
}
