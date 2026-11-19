package catalog

import (
	"regexp"
	"strings"
)

var productionCredit = regexp.MustCompile(`(?i)[（(]\s*(?:(?:AI\s*(?:生成(?:原图|插画)?|辅助(?:翻译|生成)?))|(?:项目|人工)?校对)(?:\s*[，,、/]\s*(?:(?:AI\s*(?:生成(?:原图|插画)?|辅助(?:翻译|生成)?))|(?:项目|人工)?校对))*\s*[）)]`)

// CreatorName keeps production notes out of the author and illustrator names.
// Source and licence disclosures are maintained separately.
func CreatorName(value string) string {
	return strings.TrimSpace(productionCredit.ReplaceAllString(value, ""))
}
