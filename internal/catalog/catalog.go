// Package catalog loads versioned story manifests. The browser never owns content data.
package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"pic/internal/assets"
	"pic/internal/model"
)

var Ages = []model.Option{{ID: "0-2", Name: "0–2 岁", Description: "看图认知 · 亲子陪伴"}, {ID: "3-4", Name: "3–4 岁", Description: "发现世界 · 快乐成长"}, {ID: "5-6", Name: "5–6 岁", Description: "独立思考 · 自主阅读"}}
var Categories = []model.Option{{ID: "animals", Name: "动物朋友", Description: "认识可爱的动物伙伴"}, {ID: "habits", Name: "生活习惯", Description: "在故事里慢慢长大"}, {ID: "emotions", Name: "情绪表达", Description: "和每一种心情做朋友"}, {ID: "bedtime", Name: "睡前故事", Description: "给今天一个温柔的晚安"}, {ID: "nature", Name: "自然探索", Description: "发现身边的小小世界"}, {ID: "cognition", Name: "认知启蒙", Description: "颜色、数字与想象力"}}

type Catalog struct{ Books []model.Book }

func known(options []model.Option, value string) bool {
	for _, o := range options {
		if o.ID == value {
			return true
		}
	}
	return false
}
func safeAsset(path string) bool {
	return assets.SafePath(path)
}

func Validate(b model.Book, requireApproval bool) error {
	if b.ID == "" || strings.ContainsAny(b.ID, "/\\. ") || b.TitleZH == "" || b.Description == "" || b.Author == "" || b.Illustrator == "" {
		return fmt.Errorf("缺少有效 ID、书名、简介或作者信息")
	}
	if b.Status != "published" && b.Status != "draft" && b.Status != "offline" {
		return fmt.Errorf("无效发布状态")
	}
	if b.License.ReviewStatus != "pending" && b.License.ReviewStatus != "approved" && b.License.ReviewStatus != "rejected" {
		return fmt.Errorf("无效授权审核状态")
	}
	if b.License.Type == "" || b.License.Attribution == "" {
		return fmt.Errorf("缺少来源类型或署名")
	}
	if requireApproval && b.Status == "published" && (b.License.ReviewStatus != "approved" || !b.License.CommercialUse || !b.License.SelfHosting || !b.License.TranslationAllowed || !b.License.AudioDerivativeAllowed) {
		return fmt.Errorf("发布需要完整授权审核")
	}
	if b.PageCount < 1 || len(b.Pages) != b.PageCount || !safeAsset(b.Cover) {
		return fmt.Errorf("封面或页数无效")
	}
	if len(b.Ages) == 0 || len(b.Categories) == 0 || len(b.Languages) == 0 {
		return fmt.Errorf("缺少年龄、主题或语言")
	}
	for _, a := range b.Ages {
		if !known(Ages, a) {
			return fmt.Errorf("未知年龄 %q", a)
		}
	}
	for _, c := range b.Categories {
		if !known(Categories, c) {
			return fmt.Errorf("未知分类 %q", c)
		}
	}
	for _, l := range b.Languages {
		if l != "zh" && l != "en" {
			return fmt.Errorf("未知语言 %q", l)
		}
	}
	for i, p := range b.Pages {
		if p.Number != i+1 || !safeAsset(p.Image) || p.ImageAlt == "" {
			return fmt.Errorf("第 %d 页的序号、图片或替代文字无效", i+1)
		}
		if contains(b.Languages, "zh") && p.TextZH == "" || contains(b.Languages, "en") && p.TextOriginal == "" {
			return fmt.Errorf("第 %d 页缺少语言文本", i+1)
		}
		for _, audio := range []string{p.AudioZH, p.AudioOriginal} {
			if audio != "" && !safeAsset(audio) {
				return fmt.Errorf("音频路径无效")
			}
		}
		if err := ValidateDialogue(p, b.Languages); err != nil {
			return fmt.Errorf("第 %d 页：%w", i+1, err)
		}
	}
	return nil
}

func Load(dir, webDir string, requireApproval bool) (*Catalog, error) {
	checker, err := assets.NewChecker(assets.Options{WebDir: webDir, Mode: "local"})
	if err != nil {
		return nil, err
	}
	return LoadWithAssets(dir, requireApproval, func(paths []string) error { return checker.Check(context.Background(), paths) })
}

// LoadWithAssets validates manifests before checking resources in one batch.
func LoadWithAssets(dir string, requireApproval bool, check func([]string) error) (*Catalog, error) {
	paths, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		return nil, err
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("内容目录 %s 没有绘本 JSON", dir)
	}
	c := &Catalog{}
	var resourcePaths []string
	seen := map[string]bool{}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		var b model.Book
		if err = json.Unmarshal(data, &b); err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		if err = Validate(b, requireApproval); err != nil {
			return nil, fmt.Errorf("%s: %w", path, err)
		}
		if seen[b.ID] {
			return nil, fmt.Errorf("重复 ID %s", b.ID)
		}
		seen[b.ID] = true
		assets := []string{b.Cover}
		for _, p := range b.Pages {
			assets = append(assets, p.Image)
			if p.AudioZH != "" {
				assets = append(assets, p.AudioZH)
			}
			if p.AudioOriginal != "" {
				assets = append(assets, p.AudioOriginal)
			}
		}
		resourcePaths = append(resourcePaths, assets...)
		c.Books = append(c.Books, b)
	}
	if err := check(resourcePaths); err != nil {
		return nil, err
	}
	return c, nil
}

func contains(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}
func (c *Catalog) Get(id string) (model.Book, bool) {
	for _, b := range c.Books {
		if b.ID == id && b.Status == "published" {
			return b, true
		}
	}
	return model.Book{}, false
}
func (c *Catalog) List(q model.Query) ([]model.Book, int) {
	items := []model.Book{}
	needle := strings.ToLower(strings.TrimSpace(q.Q))
	for _, b := range c.Books {
		if b.Status != "published" || q.Age != "" && !contains(b.Ages, q.Age) || q.Category != "" && !contains(b.Categories, q.Category) || q.Language != "" && !contains(b.Languages, q.Language) || q.IDs != nil && !contains(q.IDs, b.ID) || q.Featured && b.Featured < 1 {
			continue
		}
		haystack := b.TitleZH + " " + b.TitleOriginal + " " + b.Author + " " + b.Description + " " + strings.Join(b.Categories, " ")
		for _, o := range Categories {
			if contains(b.Categories, o.ID) {
				haystack += " " + o.Name
			}
		}
		if needle != "" && !strings.Contains(strings.ToLower(haystack), needle) {
			continue
		}
		b.Pages = nil
		items = append(items, b)
	}
	sort.SliceStable(items, func(i, j int) bool {
		switch q.Sort {
		case "newest":
			return items[i].PublishedAt > items[j].PublishedAt
		case "title":
			return items[i].TitleZH < items[j].TitleZH
		default:
			a, b := items[i].Featured, items[j].Featured
			if a == 0 {
				a = 999
			}
			if b == 0 {
				b = 999
			}
			return a < b
		}
	})
	total := len(items)
	start := max(0, min(q.Offset, total))
	limit := q.Limit
	if limit < 1 {
		limit = 24
	}
	limit = min(limit, 100)
	return items[start:min(start+limit, total)], total
}
