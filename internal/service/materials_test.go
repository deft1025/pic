package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"pic/internal/model"
	"pic/internal/repository"
	"reflect"
	"strings"
	"testing"
)

type materialMemory struct {
	snapshot repository.MaterialSnapshot
	missing  bool
	saved    *model.Book
	conflict bool
}

func (m *materialMemory) Material(context.Context, string) (repository.MaterialSnapshot, error) {
	if m.missing {
		return repository.MaterialSnapshot{}, sql.ErrNoRows
	}
	data, _ := json.Marshal(m.snapshot)
	var b repository.MaterialSnapshot
	json.Unmarshal(data, &b)
	return b, nil
}
func (m *materialMemory) MaterialIDs(context.Context) ([]string, error) {
	return []string{m.snapshot.Book.ID}, nil
}
func (m *materialMemory) SaveMaterial(_ context.Context, b model.Book, rev string) error {
	if m.conflict {
		return repository.ErrMaterialConflict
	}
	m.saved = &b
	return nil
}
func materialFixture(t *testing.T) model.Book {
	t.Helper()
	data, err := os.ReadFile("../../tests/fixtures/books/moon-rabbit.json")
	if err != nil {
		t.Fatal(err)
	}
	var b model.Book
	if err = json.Unmarshal(data, &b); err != nil {
		t.Fatal(err)
	}
	b.ReadingValue = "陪孩子在故事里认识友谊"
	b.Voices = map[string]model.Voice{"zh": {Provider: "edge-tts", VoiceID: "zh-CN-XiaoxiaoNeural", GeneratedAt: "2026-11-12T00:00:00Z", ReviewStatus: "pending"}, "en": {Provider: "edge-tts", VoiceID: "en-US-JennyNeural", GeneratedAt: "2026-11-12T00:00:00Z", ReviewStatus: "pending"}}
	for i := range b.Pages {
		b.Pages[i].AudioZH = "/assets/test/zh.mp3"
		b.Pages[i].AudioOriginal = "/assets/test/en.mp3"
	}
	return b
}
func TestMaterialEditsClearOnlyStaleLanguageAndRegenerateVersion(t *testing.T) {
	m := &materialMemory{snapshot: repository.MaterialSnapshot{Book: materialFixture(t), Revision: "read-revision"}}
	next, _ := m.Material(context.Background(), "")
	next.Book.Pages[0].TextZH += "新正文。"
	// A formerly valid layout cannot stay attached to new text.
	next.Book.Pages[0].Dialogue = &model.DialogueLayout{Length: map[string]int{"zh": 1, "en": 1}}
	if err := NewMaterials(m, false).Save(context.Background(), next, nil); err != nil {
		t.Fatal(err)
	}
	b := m.saved
	if b == nil {
		t.Fatal("did not save")
	}
	if _, exists := b.Voices["zh"]; exists {
		t.Fatal("stale voice retained")
	}
	if _, exists := b.Voices["en"]; !exists {
		t.Fatal("unchanged English voice lost")
	}
	for _, p := range b.Pages {
		if p.AudioZH != "" || p.AudioOriginal != "/assets/test/en.mp3" {
			t.Fatal("incorrect audio invalidation")
		}
	}
	if b.Pages[0].Dialogue != nil || b.Version == next.Book.Version {
		t.Fatal("stale layout/version retained")
	}
}
func TestMaterialConflictAndAssetFailureNeverSave(t *testing.T) {
	for _, reason := range []string{"stale snapshot", "failed assets", "race at commit"} {
		t.Run(reason, func(t *testing.T) {
			m := &materialMemory{snapshot: repository.MaterialSnapshot{Book: materialFixture(t), Revision: "current"}}
			next, _ := m.Material(context.Background(), "")
			var check func([]string) error
			switch reason {
			case "stale snapshot":
				next.Revision = "old"
			case "failed assets":
				check = func([]string) error { return errors.New("missing audio") }
			case "race at commit":
				m.conflict = true
			}
			if err := NewMaterials(m, false).Save(context.Background(), next, check); err == nil {
				t.Fatal("expected failure")
			}
			if m.saved != nil {
				t.Fatal("failure wrote content")
			}
		})
	}
}
func TestNewMaterialHasNoApprovalGateOrRequiredLocalJSON(t *testing.T) {
	m := &materialMemory{missing: true}
	b := materialFixture(t)
	if err := NewMaterials(m, false).Save(context.Background(), repository.MaterialSnapshot{Book: b}, nil); err != nil {
		t.Fatal(err)
	}
	if m.saved == nil || m.saved.Status != "published" || m.saved.License.ReviewStatus != "pending" {
		t.Fatal("publication policy changed")
	}
}

func TestReadingValueRequiredForPublishedMaterialsAndDoesNotInvalidateAudio(t *testing.T) {
	for _, value := range []string{"", " \t ", strings.Repeat("字", 81), "两行\n文字"} {
		m := &materialMemory{snapshot: repository.MaterialSnapshot{Book: materialFixture(t), Revision: "current"}}
		next, _ := m.Material(context.Background(), "")
		next.Book.ReadingValue = value
		if err := NewMaterials(m, false).Save(context.Background(), next, nil); err == nil || m.saved != nil {
			t.Fatalf("invalid recommendation was saved: %q", value)
		}
	}
	m := &materialMemory{snapshot: repository.MaterialSnapshot{Book: materialFixture(t), Revision: "current"}}
	next, _ := m.Material(context.Background(), "")
	next.Book.ReadingValue = "  鼓励孩子勇敢做自己  "
	if err := NewMaterials(m, false).Save(context.Background(), next, nil); err != nil {
		t.Fatal(err)
	}
	if m.saved.ReadingValue != "鼓励孩子勇敢做自己" || !reflect.DeepEqual(m.saved.Pages, next.Book.Pages) || !reflect.DeepEqual(m.saved.Voices, next.Book.Voices) {
		t.Fatal("recommendation edit changed story pages or recordings")
	}
}
