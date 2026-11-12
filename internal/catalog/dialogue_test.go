package catalog

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"unicode/utf16"

	"pic/internal/model"
)

func dialoguePage() model.Page {
	p := model.Page{TextZH: "你好😀", TextOriginal: "Hello 😀"}
	p.Dialogue = &model.DialogueLayout{AspectRatio: [2]float64{3, 2}, Length: map[string]int{}, TextSHA256: map[string]string{}, Parts: []model.DialoguePart{{Start: map[string]int{"zh": 0, "en": 0}, End: map[string]int{}, Speaker: map[string]string{"zh": "角色", "en": "Character"}, X: 5, Y: 5, Width: 80}}}
	for lang, text := range map[string]string{"zh": p.TextZH, "en": p.TextOriginal} {
		p.Dialogue.Length[lang] = len(utf16.Encode([]rune(text)))
		p.Dialogue.TextSHA256[lang] = fmt.Sprintf("%x", sha256.Sum256([]byte(text)))
		p.Dialogue.Parts[0].End[lang] = p.Dialogue.Length[lang]
	}
	return p
}
func TestDialogueTextIntegrityAndUTF16Bounds(t *testing.T) {
	for _, tc := range []struct {
		name      string
		change    func(*model.Page)
		wantError bool
	}{
		{"valid bilingual layout", func(*model.Page) {}, false},
		{"same length text change", func(p *model.Page) { p.TextZH = "您好😀" }, true},
		{"surrogate split", func(p *model.Page) { p.Dialogue.Parts[0].End["zh"] = 3 }, true},
		{"missing speaker", func(p *model.Page) { delete(p.Dialogue.Parts[0].Speaker, "en") }, true},
		{"out of image", func(p *model.Page) { p.Dialogue.Parts[0].X = 80 }, true},
		{"overlapping text ranges", func(p *model.Page) { p.Dialogue.Parts = append(p.Dialogue.Parts, p.Dialogue.Parts[0]) }, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := dialoguePage()
			tc.change(&p)
			if err := ValidateDialogue(p, []string{"zh", "en"}); (err != nil) != tc.wantError {
				t.Fatal(err)
			}
		})
	}
}
func TestProductionDialogueManifestsValidate(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/library.json")
	if err != nil {
		t.Fatal(err)
	}
	var c struct {
		Books []model.Book `json:"books"`
	}
	if err = json.Unmarshal(data, &c); err != nil {
		t.Fatal(err)
	}
	for _, b := range c.Books {
		if err = Validate(b, false); err != nil {
			t.Fatal(err)
		}
	}
	withDialogue := 0
	for _, b := range c.Books {
		for _, p := range b.Pages {
			if p.Dialogue != nil {
				withDialogue++
			}
		}
	}
	if withDialogue == 0 {
		t.Fatal("no production dialogue metadata validated")
	}
}
