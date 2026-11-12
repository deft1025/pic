// Package repository implements the live MySQL content store.
package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"

	"pic/internal/catalog"
	"pic/internal/model"
)

type Store interface {
	Ping(context.Context) error
	List(context.Context, model.Query) ([]model.Book, int, error)
	Get(context.Context, string) (model.Book, error)
	Pages(context.Context, string) ([]model.Page, error)
	Options(context.Context) (model.Options, error)
}

type MySQL struct {
	db     *sql.DB
	strict bool
}

func New(db *sql.DB, strict bool) *MySQL        { return &MySQL{db: db, strict: strict} }
func (r *MySQL) Ping(ctx context.Context) error { return r.db.PingContext(ctx) }

const selectBook = `SELECT b.book_id,b.title_zh,b.title_original,b.author,b.illustrator,b.description_zh,
 b.cover,b.page_count,b.reading_minutes,b.featured_order,b.published_at,b.publish_status,b.content_version,b.is_demo,
 l.license_type,l.source_url,l.license_url,l.attribution,l.review_status,
 l.commercial_use,l.self_hosting,l.translation_allowed,l.audio_derivative_allowed
 FROM books b JOIN book_licenses l ON l.book_id=b.book_id`

type scanner interface{ Scan(...any) error }

func scanBook(row scanner) (model.Book, error) {
	var b model.Book
	var published time.Time
	err := row.Scan(&b.ID, &b.TitleZH, &b.TitleOriginal, &b.Author, &b.Illustrator, &b.Description,
		&b.Cover, &b.PageCount, &b.Minutes, &b.Featured, &published, &b.Status, &b.Version, &b.IsDemo,
		&b.License.Type, &b.License.SourceURL, &b.License.URL, &b.License.Attribution, &b.License.ReviewStatus,
		&b.License.CommercialUse, &b.License.SelfHosting, &b.License.TranslationAllowed, &b.License.AudioDerivativeAllowed)
	b.PublishedAt = published.UTC().Format(time.RFC3339Nano)
	b.Ages = []string{}
	b.Categories = []string{}
	b.Languages = []string{}
	return b, err
}

func placeholders(n int) string {
	if n < 1 {
		return "NULL"
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}
func (r *MySQL) visibility() string {
	where := "b.publish_status='published'"
	if r.strict {
		where += " AND l.review_status='approved' AND l.commercial_use=1 AND l.self_hosting=1 AND l.translation_allowed=1 AND l.audio_derivative_allowed=1"
	}
	return where
}

func (r *MySQL) Get(ctx context.Context, id string) (model.Book, error) {
	b, err := scanBook(r.db.QueryRowContext(ctx, selectBook+" WHERE "+r.visibility()+" AND b.book_id=?", id))
	if err != nil {
		return b, err
	}
	items := []model.Book{b}
	if err = r.relations(ctx, items); err != nil {
		return model.Book{}, err
	}
	return items[0], nil
}

func (r *MySQL) Pages(ctx context.Context, id string) ([]model.Page, error) {
	query := func(column string) string {
		return `SELECT p.page_number,p.image_path,p.image_alt,p.text_zh,p.text_original,p.audio_zh_path,p.audio_original_path,` + column + `
 FROM book_pages p JOIN books b ON b.book_id=p.book_id JOIN book_licenses l ON l.book_id=b.book_id
 WHERE ` + r.visibility() + ` AND p.book_id=? ORDER BY p.page_number`
	}
	rows, err := r.db.QueryContext(ctx, query("p.dialogue_layout"), id)
	if missingDialogueColumn(err) {
		// Old schemas remain readable until the operator applies the migration.
		// This still reads only MySQL; there is no static story/layout fallback.
		rows, err = r.db.QueryContext(ctx, query("NULL AS dialogue_layout"), id)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []model.Page{}
	for rows.Next() {
		var p model.Page
		var dialogue []byte
		if err = rows.Scan(&p.Number, &p.Image, &p.ImageAlt, &p.TextZH, &p.TextOriginal, &p.AudioZH, &p.AudioOriginal, &dialogue); err != nil {
			return nil, err
		}
		if len(dialogue) > 0 && string(dialogue) != "null" {
			languages := []string{}
			if p.TextZH != "" {
				languages = append(languages, "zh")
			}
			if p.TextOriginal != "" {
				languages = append(languages, "en")
			}
			// Optional typography must not hide the story if a database edit
			// leaves stale offsets, even when the new text has the same length.
			if json.Unmarshal(dialogue, &p.Dialogue) != nil || catalog.ValidateDialogue(p, languages) != nil {
				p.Dialogue = nil
			}
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

func missingDialogueColumn(err error) bool {
	var databaseError *mysql.MySQLError
	return errors.As(err, &databaseError) && databaseError.Number == 1054 && strings.Contains(databaseError.Message, "dialogue_layout")
}

func (r *MySQL) hasDialogueColumn(ctx context.Context) (bool, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT dialogue_layout FROM book_pages LIMIT 0")
	if missingDialogueColumn(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, rows.Close()
}

func (r *MySQL) Options(ctx context.Context) (model.Options, error) {
	out := model.Options{}
	for _, entry := range []struct {
		table  string
		column string
		dest   *[]model.Option
	}{{"age_ranges", "age_id", &out.Ages}, {"categories", "category_id", &out.Categories}, {"languages", "language_id", &out.Languages}} {
		rows, err := r.db.QueryContext(ctx, "SELECT "+entry.column+",name,description FROM "+entry.table+" ORDER BY sort_order,"+entry.column)
		if err != nil {
			return out, err
		}
		*entry.dest = []model.Option{}
		for rows.Next() {
			var o model.Option
			if err = rows.Scan(&o.ID, &o.Name, &o.Description); err != nil {
				rows.Close()
				return out, err
			}
			*entry.dest = append(*entry.dest, o)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return out, err
		}
	}
	return out, nil
}

// Fetch relations for the entire result page instead of running per-book queries.
func (r *MySQL) relations(ctx context.Context, books []model.Book) error {
	if len(books) == 0 {
		return nil
	}
	args := make([]any, len(books))
	byID := map[string]*model.Book{}
	for i := range books {
		args[i] = books[i].ID
		byID[books[i].ID] = &books[i]
	}
	for _, relation := range []struct{ table, column string }{{"book_age_ranges", "age_id"}, {"book_categories", "category_id"}, {"book_languages", "language_id"}} {
		rows, err := r.db.QueryContext(ctx, fmt.Sprintf("SELECT book_id,%s FROM %s WHERE book_id IN (%s) ORDER BY book_id,sort_order,%s", relation.column, relation.table, placeholders(len(args)), relation.column), args...)
		if err != nil {
			return err
		}
		for rows.Next() {
			var id, value string
			if err = rows.Scan(&id, &value); err != nil {
				rows.Close()
				return err
			}
			b := byID[id]
			if b == nil {
				continue
			}
			switch relation.table {
			case "book_age_ranges":
				b.Ages = append(b.Ages, value)
			case "book_categories":
				b.Categories = append(b.Categories, value)
			case "book_languages":
				b.Languages = append(b.Languages, value)
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
	}
	rows, err := r.db.QueryContext(ctx, "SELECT book_id,language_id,provider,voice_id,generated_at,review_status FROM book_voices WHERE book_id IN ("+placeholders(len(args))+")", args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id, lang string
		var v model.Voice
		var generated time.Time
		if err = rows.Scan(&id, &lang, &v.Provider, &v.VoiceID, &generated, &v.ReviewStatus); err != nil {
			return err
		}
		v.GeneratedAt = generated.UTC().Format(time.RFC3339Nano)
		b := byID[id]
		if b == nil {
			continue
		}
		if b.Voices == nil {
			b.Voices = map[string]model.Voice{}
		}
		b.Voices[lang] = v
	}
	return rows.Err()
}
