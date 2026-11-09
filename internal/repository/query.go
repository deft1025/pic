package repository

import (
	"context"
	"strings"

	"pic/internal/model"
)

// escapeLike makes % and _ literal search characters, rather than wildcard input.
// ! is explicitly declared as the escape character, independent of SQL modes.
func escapeLike(s string) string {
	return strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(s)
}

func (r *MySQL) where(q model.Query) (string, []any) {
	parts := []string{r.visibility()}
	args := []any{}
	for _, f := range []struct{ value, table, column string }{{q.Age, "book_age_ranges", "age_id"}, {q.Category, "book_categories", "category_id"}, {q.Language, "book_languages", "language_id"}} {
		if f.value != "" {
			parts = append(parts, "EXISTS (SELECT 1 FROM "+f.table+" f WHERE f.book_id=b.book_id AND f."+f.column+"=?)")
			args = append(args, f.value)
		}
	}
	if q.Featured {
		parts = append(parts, "b.featured_order>0")
	}
	if q.IDs != nil {
		if len(q.IDs) == 0 {
			parts = append(parts, "1=0")
		} else {
			parts = append(parts, "b.book_id IN ("+placeholders(len(q.IDs))+")")
			for _, id := range q.IDs {
				args = append(args, id)
			}
		}
	}
	if needle := strings.TrimSpace(q.Q); needle != "" {
		match := "%" + escapeLike(needle) + "%"
		parts = append(parts, `(CONCAT_WS(' ',b.title_zh,b.title_original,b.author,b.description_zh) LIKE ? ESCAPE '!'
   OR EXISTS (SELECT 1 FROM book_categories bc JOIN categories c ON c.category_id=bc.category_id
    WHERE bc.book_id=b.book_id AND CONCAT_WS(' ',c.category_id,c.name) LIKE ? ESCAPE '!'))`)
		args = append(args, match, match)
	}
	return strings.Join(parts, " AND "), args
}
func orderBy(sort string) string {
	switch sort {
	case "newest":
		return "b.published_at DESC,b.book_id ASC"
	case "title":
		return "b.title_zh ASC,b.book_id ASC"
	default:
		return "CASE WHEN b.featured_order=0 THEN 1 ELSE 0 END,b.featured_order ASC,b.book_id ASC"
	}
}

func (r *MySQL) List(ctx context.Context, q model.Query) ([]model.Book, int, error) {
	where, args := r.where(q)
	total := 0
	err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM books b JOIN book_licenses l ON l.book_id=b.book_id WHERE "+where, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	limit := q.Limit
	if limit < 1 {
		limit = 24
	}
	limit = min(limit, 100)
	offset := max(0, q.Offset)
	queryArgs := append(append([]any{}, args...), limit, offset)
	rows, err := r.db.QueryContext(ctx, selectBook+" WHERE "+where+" ORDER BY "+orderBy(q.Sort)+" LIMIT ? OFFSET ?", queryArgs...)
	if err != nil {
		return nil, 0, err
	}
	books := []model.Book{}
	for rows.Next() {
		b, e := scanBook(rows)
		if e != nil {
			rows.Close()
			return nil, 0, e
		}
		books = append(books, b)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, 0, err
	}
	if err = r.relations(ctx, books); err != nil {
		return nil, 0, err
	}
	return books, total, nil
}
