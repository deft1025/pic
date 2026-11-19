package catalog

import "testing"

func TestCreatorName(t *testing.T) {
	for input, want := range map[string]string{
		"StoryBloom（AI生成，项目校对）": "StoryBloom",
		"StoryBloom（AI生成原图）":    "StoryBloom",
		"小小绘本馆 (AI 辅助翻译、人工校对)":  "小小绘本馆",
		"某作者（项目校对）":             "某作者",
		"作者（原名）":                "作者（原名）",
		"Wesley van Eeden":      "Wesley van Eeden",
	} {
		if got := CreatorName(input); got != want {
			t.Errorf("CreatorName(%q) = %q; want %q", input, got, want)
		}
	}
}
