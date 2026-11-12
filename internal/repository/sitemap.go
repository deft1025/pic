package repository

import "context"

// PublishedBookIDs uses the same visibility rules as the public catalog, without
// its pagination limit or the unrelated page, voice and category payloads.
func (r *MySQL) PublishedBookIDs(ctx context.Context) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT b.book_id FROM books b
 JOIN book_licenses l ON l.book_id=b.book_id WHERE `+r.visibility()+` ORDER BY b.book_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
