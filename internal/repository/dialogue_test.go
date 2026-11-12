package repository

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"unicode/utf16"

	"pic/internal/catalog"
	"pic/internal/model"
)

func storedDialogue(textZH, textEN string) []byte {
	return []byte(fmt.Sprintf(`{"aspect_ratio":[3,2],"length":{"zh":2,"en":5},"text_sha256":{"zh":"%x","en":"%x"},"parts":[{"start":{"zh":0,"en":0},"end":{"zh":2,"en":5},"speaker":{"zh":"角色","en":"Character"},"x":5,"y":5,"width":80}]}`, sha256.Sum256([]byte(textZH)), sha256.Sum256([]byte(textEN))))
}

func TestDialogueReadAndLegacySchema(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		layout := storedDialogue("你好", "Hello")
		state := &importState{legacy: legacy, layout: layout}
		db := sql.OpenDB(testConnector{state})
		pages, err := New(db, false).Pages(context.Background(), "a-book")
		db.Close()
		if err != nil || len(pages) != 1 {
			t.Fatalf("legacy=%v pages=%v error=%v", legacy, pages, err)
		}
		if (pages[0].Dialogue == nil) != legacy {
			t.Fatalf("layout not restored: %+v", pages[0])
		}
		if pages[0].TextZH != "你好" {
			t.Fatal("legacy read changed the story")
		}
	}
}

func TestStaleOrMalformedDialogueDoesNotBlockReading(t *testing.T) {
	for _, layout := range [][]byte{
		storedDialogue("您好", "Hello"), // Same UTF-16 length, different text hash.
		[]byte(`{"parts":"invalid JSON shape"}`),
	} {
		db := sql.OpenDB(testConnector{&importState{layout: layout}})
		pages, err := New(db, false).Pages(context.Background(), "a-book")
		db.Close()
		if err != nil || len(pages) != 1 || pages[0].Dialogue != nil || pages[0].TextZH != "你好" {
			t.Fatalf("optional layout blocked reading: %+v %v", pages, err)
		}
	}
}
func TestDialogueImportRequiresColumnAndClearsRemovedLayout(t *testing.T) {
	c, err := catalog.Load("../../tests/fixtures/books", "../../tests/fixtures/web", false)
	if err != nil {
		t.Fatal(err)
	}
	b := c.Books[0]
	b.Pages = append([]model.Page(nil), b.Pages...)
	d := &model.DialogueLayout{AspectRatio: [2]float64{3, 2}, Length: map[string]int{}, TextSHA256: map[string]string{}, Parts: []model.DialoguePart{{Start: map[string]int{"zh": 0, "en": 0}, End: map[string]int{}, Speaker: map[string]string{"zh": "角色", "en": "Character"}, X: 5, Y: 5, Width: 80}}}
	for lang, text := range map[string]string{"zh": b.Pages[0].TextZH, "en": b.Pages[0].TextOriginal} {
		d.Length[lang] = len(utf16.Encode([]rune(text)))
		d.TextSHA256[lang] = fmt.Sprintf("%x", sha256.Sum256([]byte(text)))
		d.Parts[0].End[lang] = d.Length[lang]
	}
	b.Pages[0].Dialogue = d
	state := &importState{legacy: true}
	db := sql.OpenDB(testConnector{state})
	defer db.Close()
	r := New(db, false)
	if err = r.Import(context.Background(), []model.Book{b}); err == nil || !strings.Contains(err.Error(), "20261111_dialogue_layout.sql") {
		t.Fatalf("missing migration error: %v", err)
	}
	if state.begin != 0 || state.writes != 0 {
		t.Fatal("missing column started writes")
	}
	state.legacy = false
	if err = r.Import(context.Background(), []model.Book{b}); err != nil {
		t.Fatal(err)
	}
	var restored model.DialogueLayout
	if err = json.Unmarshal([]byte(state.pageLayouts[0].(string)), &restored); err != nil || restored.Parts[0].Speaker["zh"] != "角色" {
		t.Fatalf("lost dialogue payload: %+v %v", restored, err)
	}
	b.Pages[0].Dialogue = nil
	state.pageLayouts = nil
	if err = r.Import(context.Background(), []model.Book{b}); err != nil {
		t.Fatal(err)
	}
	if state.pageLayouts[0] != nil {
		t.Fatal("removed layout was not written as SQL NULL")
	}
}
