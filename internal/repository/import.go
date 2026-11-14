package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"pic/internal/catalog"
	"pic/internal/model"
)

// Import atomically replaces each supplied book and its child rows in one batch
// transaction. Unrelated books remain untouched. Reimporting the same IDs is safe.
func (r *MySQL) Import(ctx context.Context, books []model.Book) error {
	return r.importBooks(ctx, books, nil)
}

// guard runs inside the same transaction, before replacing any content.
func (r *MySQL) importBooks(ctx context.Context, books []model.Book, guard func(*sql.Tx) error) error {
	seen := map[string]bool{}
	published := make([]time.Time, len(books))
	generated := map[string]map[string]time.Time{}
	// Validate the whole batch before starting any write.
	for i, b := range books {
		if err := catalog.Validate(b, r.strict); err != nil {
			return fmt.Errorf("%s: %w", b.ID, err)
		}
		if seen[b.ID] {
			return fmt.Errorf("重复绘本 ID %s", b.ID)
		}
		seen[b.ID] = true
		if utf8.RuneCountInString(b.ID) > 64 || utf8.RuneCountInString(b.TitleZH) > 255 || utf8.RuneCountInString(b.TitleOriginal) > 255 || utf8.RuneCountInString(b.Author) > 255 || utf8.RuneCountInString(b.Illustrator) > 255 || utf8.RuneCountInString(b.Version) > 100 || b.Minutes < 0 || b.Minutes > 65535 || b.Featured < 0 || b.PageCount > 65535 {
			return fmt.Errorf("%s: 字段超出数据库限制", b.ID)
		}
		p, err := time.Parse(time.RFC3339Nano, b.PublishedAt)
		if err != nil {
			return fmt.Errorf("%s: published_at 必须是 ISO 8601 时间", b.ID)
		}
		published[i] = p.UTC()
		for _, relation := range [][]string{b.Ages, b.Categories, b.Languages} {
			unique := map[string]bool{}
			for _, id := range relation {
				if unique[id] {
					return fmt.Errorf("%s: 关系项重复", b.ID)
				}
				unique[id] = true
			}
		}
		generated[b.ID] = map[string]time.Time{}
		for lang, v := range b.Voices {
			if lang != "zh" && lang != "en" || !strings.Contains("|"+strings.Join(b.Languages, "|")+"|", "|"+lang+"|") {
				return fmt.Errorf("%s: 语音语言无效", b.ID)
			}
			if v.Provider == "" || v.VoiceID == "" || v.ReviewStatus != "pending" && v.ReviewStatus != "approved" && v.ReviewStatus != "rejected" {
				return fmt.Errorf("%s: 语音生产记录不完整", b.ID)
			}
			g, err := time.Parse(time.RFC3339Nano, v.GeneratedAt)
			if err != nil {
				return fmt.Errorf("%s: 语音时间无效", b.ID)
			}
			generated[b.ID][lang] = g.UTC()
			for _, p := range b.Pages {
				if lang == "zh" && p.AudioZH == "" || lang == "en" && p.AudioOriginal == "" {
					return fmt.Errorf("%s: 配置语音的语言必须逐页提供音频", b.ID)
				}
			}
		}
	}
	withDialogue, err := r.hasDialogueColumn(ctx)
	if err != nil {
		return err
	}
	if !withDialogue {
		for _, b := range books {
			for _, p := range b.Pages {
				if p.Dialogue != nil {
					return fmt.Errorf("数据库尚未添加 book_pages.dialogue_layout；请先执行 docs/migrations/20261111_dialogue_layout.sql，再运行 importer；本次未写入数据")
				}
			}
		}
	}
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if guard != nil {
		if err = guard(tx); err != nil {
			return err
		}
	}
	for i, b := range books {
		_, err = tx.ExecContext(ctx, `INSERT INTO books
   (book_id,title_zh,title_original,author,illustrator,description_zh,reading_value,cover,page_count,reading_minutes,featured_order,published_at,publish_status,content_version,is_demo)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   ON DUPLICATE KEY UPDATE title_zh=VALUES(title_zh),title_original=VALUES(title_original),author=VALUES(author),
   illustrator=VALUES(illustrator),description_zh=VALUES(description_zh),reading_value=VALUES(reading_value),cover=VALUES(cover),page_count=VALUES(page_count),
   reading_minutes=VALUES(reading_minutes),featured_order=VALUES(featured_order),published_at=VALUES(published_at),
   publish_status=VALUES(publish_status),content_version=VALUES(content_version),is_demo=VALUES(is_demo)`,
			b.ID, b.TitleZH, b.TitleOriginal, b.Author, b.Illustrator, b.Description, b.ReadingValue, b.Cover, b.PageCount, b.Minutes, b.Featured, published[i], b.Status, b.Version, b.IsDemo)
		if err != nil {
			return fmt.Errorf("写入绘本 %s: %w", b.ID, err)
		}
		l := b.License
		_, err = tx.ExecContext(ctx, `INSERT INTO book_licenses (book_id,license_type,source_url,license_url,attribution,review_status,commercial_use,self_hosting,translation_allowed,audio_derivative_allowed)
   VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE license_type=VALUES(license_type),source_url=VALUES(source_url),
   license_url=VALUES(license_url),attribution=VALUES(attribution),review_status=VALUES(review_status),commercial_use=VALUES(commercial_use),
   self_hosting=VALUES(self_hosting),translation_allowed=VALUES(translation_allowed),audio_derivative_allowed=VALUES(audio_derivative_allowed)`,
			b.ID, l.Type, l.SourceURL, l.URL, l.Attribution, l.ReviewStatus, l.CommercialUse, l.SelfHosting, l.TranslationAllowed, l.AudioDerivativeAllowed)
		if err != nil {
			return err
		}
		// Delete voice records before their parent book_languages rows.
		for _, table := range []string{"book_voices", "book_pages", "book_age_ranges", "book_categories", "book_languages"} {
			if _, err = tx.ExecContext(ctx, "DELETE FROM "+table+" WHERE book_id=?", b.ID); err != nil {
				return err
			}
		}
		for _, relation := range []struct {
			table, column string
			values        []string
		}{{"book_age_ranges", "age_id", b.Ages}, {"book_categories", "category_id", b.Categories}, {"book_languages", "language_id", b.Languages}} {
			for n, value := range relation.values {
				if _, err = tx.ExecContext(ctx, "INSERT INTO "+relation.table+" (book_id,"+relation.column+",sort_order) VALUES (?,?,?)", b.ID, value, n); err != nil {
					return err
				}
			}
		}
		for _, p := range b.Pages {
			args := []any{b.ID, p.Number, p.Image, p.ImageAlt, p.TextZH, p.TextOriginal, p.AudioZH, p.AudioOriginal, b.Version}
			query := `INSERT INTO book_pages (book_id,page_number,image_path,image_alt,text_zh,text_original,audio_zh_path,audio_original_path,content_version) VALUES (?,?,?,?,?,?,?,?,?)`
			if withDialogue {
				var dialogue any
				if p.Dialogue != nil {
					encoded, e := json.Marshal(p.Dialogue)
					if e != nil {
						return e
					}
					dialogue = string(encoded)
				}
				query = `INSERT INTO book_pages (book_id,page_number,image_path,image_alt,text_zh,text_original,audio_zh_path,audio_original_path,content_version,dialogue_layout) VALUES (?,?,?,?,?,?,?,?,?,?)`
				args = append(args, dialogue)
			}
			_, err = tx.ExecContext(ctx, query, args...)
			if err != nil {
				return err
			}
		}
		for lang, v := range b.Voices {
			_, err = tx.ExecContext(ctx, `INSERT INTO book_voices (book_id,language_id,provider,voice_id,generated_at,review_status) VALUES (?,?,?,?,?,?)`, b.ID, lang, v.Provider, v.VoiceID, generated[b.ID][lang], v.ReviewStatus)
			if err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}
