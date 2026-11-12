package catalog

import (
	"crypto/sha256"
	"fmt"
	"math"
	"strings"
	"unicode/utf16"

	"pic/internal/model"
)

// ValidateDialogue rejects stale text offsets before the importer starts writes.
func ValidateDialogue(p model.Page, languages []string) error {
	d := p.Dialogue
	if d == nil {
		return nil
	}
	if len(d.Parts) < 1 || len(d.Parts) > 8 {
		return fmt.Errorf("对白数量须为1至8个")
	}
	for _, n := range d.AspectRatio {
		if !finite(n) || n <= 0 || n > 100 {
			return fmt.Errorf("对白画幅比例无效")
		}
	}
	for _, language := range languages {
		text := p.TextZH
		if language == "en" {
			text = p.TextOriginal
		}
		units := utf16.Encode([]rune(text))
		if length, ok := d.Length[language]; !ok || length != len(units) || d.TextSHA256[language] != fmt.Sprintf("%x", sha256.Sum256([]byte(text))) {
			return fmt.Errorf("%s对白范围与当前正文不匹配，需重新校对", language)
		}
		cursor := 0
		for _, part := range d.Parts {
			start, hasStart := part.Start[language]
			end, hasEnd := part.End[language]
			if !hasStart || !hasEnd || start < cursor || end <= start || end > len(units) || splitsSurrogate(units, start) || splitsSurrogate(units, end) || strings.TrimSpace(part.Speaker[language]) == "" {
				return fmt.Errorf("%s对白角色或文字范围无效", language)
			}
			cursor = end
		}
	}
	for _, part := range d.Parts {
		if !finite(part.X) || !finite(part.Y) || !finite(part.Width) || part.X < 0 || part.Y < 0 || part.Y >= 100 || part.Width <= 0 || part.X+part.Width > 100 {
			return fmt.Errorf("对白位置须在画面百分比范围内")
		}
		if part.Target != nil {
			if len(part.Target) != 2 || !finite(part.Target[0]) || !finite(part.Target[1]) || part.Target[0] < 0 || part.Target[0] > 100 || part.Target[1] < 0 || part.Target[1] > 100 {
				return fmt.Errorf("对白指向坐标无效")
			}
		}
	}
	return nil
}

func finite(n float64) bool { return !math.IsNaN(n) && !math.IsInf(n, 0) }
func splitsSurrogate(units []uint16, i int) bool {
	return i > 0 && i < len(units) && units[i-1] >= 0xD800 && units[i-1] <= 0xDBFF && units[i] >= 0xDC00 && units[i] <= 0xDFFF
}
