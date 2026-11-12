package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"pic/internal/catalog"
	"pic/internal/model"
)

// MaterialSnapshot is a local tooling protocol, never a public HTTP endpoint.
type MaterialSnapshot struct {
	Book     model.Book `json:"book"`
	Revision string     `json:"revision"`
}

var ErrMaterialConflict = errors.New("绘本已被其他操作修改，请重新查库后重试；本次未写入")

func materialRevision(b model.Book) string {
	data, _ := json.Marshal(b)
	return fmt.Sprintf("%x", sha256.Sum256(data))
}

// MaterialIDs includes offline/draft books for explicit maintenance, without
// changing the public repository's publication or license visibility rules.
func (r *MySQL) MaterialIDs(ctx context.Context) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT book_id FROM books ORDER BY book_id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// Read a coherent database snapshot. Missing/invalid dialogue is an error here,
// rather than the reader's graceful fallback, to avoid erasing production data.
func (r *MySQL) Material(ctx context.Context, id string) (MaterialSnapshot, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return MaterialSnapshot{}, err
	}
	defer tx.Rollback()
	b, err := readMaterial(ctx, tx, id, false)
	if err != nil {
		return MaterialSnapshot{}, err
	}
	if err = tx.Commit(); err != nil {
		return MaterialSnapshot{}, err
	}
	return MaterialSnapshot{Book: b, Revision: materialRevision(b)}, nil
}

func readMaterial(ctx context.Context, db contentReader, id string, lock bool) (model.Book, error) {
	q := selectBook + " WHERE b.book_id=?"
	if lock {
		q += " FOR UPDATE"
	}
	b, err := scanBook(db.QueryRowContext(ctx, q, id))
	if err != nil {
		return b, err
	}
	books := []model.Book{b}
	if err = relations(ctx, db, books); err != nil {
		return b, err
	}
	b = books[0]
	rows, err := db.QueryContext(ctx, `SELECT page_number,image_path,image_alt,text_zh,text_original,audio_zh_path,audio_original_path,dialogue_layout FROM book_pages WHERE book_id=? ORDER BY page_number`, id)
	if err != nil {
		return b, err
	}
	defer rows.Close()
	b.Pages = []model.Page{}
	for rows.Next() {
		var p model.Page
		var dialogue []byte
		if err = rows.Scan(&p.Number, &p.Image, &p.ImageAlt, &p.TextZH, &p.TextOriginal, &p.AudioZH, &p.AudioOriginal, &dialogue); err != nil {
			return b, err
		}
		if len(dialogue) > 0 && string(dialogue) != "null" {
			if err = json.Unmarshal(dialogue, &p.Dialogue); err != nil {
				return b, fmt.Errorf("%s 第%d页对白数据无效", id, p.Number)
			}
			if err = catalog.ValidateDialogue(p, b.Languages); err != nil {
				return b, err
			}
		}
		b.Pages = append(b.Pages, p)
	}
	return b, rows.Err()
}

// SaveMaterial uses the revision returned by Material. An empty revision means
// create-only. The full comparison runs under the book row lock and rolls back
// before any writes if generation raced with another content operation.
func (r *MySQL) SaveMaterial(ctx context.Context, b model.Book, revision string) error {
	return r.importBooks(ctx, []model.Book{b}, func(tx *sql.Tx) error {
		// Lock the parent independently: a damaged/missing license row must not
		// make an existing book look like a new create-only record.
		var existingID string
		parentErr := tx.QueryRowContext(ctx, "SELECT book_id FROM books WHERE book_id=? FOR UPDATE", b.ID).Scan(&existingID)
		if parentErr != nil && !errors.Is(parentErr, sql.ErrNoRows) {
			return parentErr
		}
		if parentErr == nil && revision == "" {
			return ErrMaterialConflict
		}
		if errors.Is(parentErr, sql.ErrNoRows) {
			if revision == "" {
				return nil
			}
			return ErrMaterialConflict
		}
		current, err := readMaterial(ctx, tx, b.ID, true)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err != nil || revision == "" || materialRevision(current) != revision {
			return ErrMaterialConflict
		}
		return nil
	})
}
