package database

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"regexp"
	"strings"
)

// ReaderSchema selects only the five additive reader tables from the canonical
// schema. It excludes content tables, seeds and any destructive statements.
func ReaderSchema(path string) ([]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, errors.New("无法读取小程序建表定义")
	}
	allowed := map[string]bool{"reader_users": true, "reader_sessions": true, "reader_favorites": true, "reader_events": true, "reader_recommendations": true}
	pattern := regexp.MustCompile("(?s)CREATE TABLE IF NOT EXISTS `([a-z_]+)` \\(.*?\\n\\) ENGINE=[^;]+;")
	result := []string{}
	for _, match := range pattern.FindAllStringSubmatch(string(data), -1) {
		if !strings.HasPrefix(match[1], "reader_") {
			continue
		}
		if !allowed[match[1]] {
			return nil, errors.New("小程序建表定义包含未预期或重复的表")
		}
		delete(allowed, match[1])
		result = append(result, match[0])
	}
	if len(allowed) != 0 {
		return nil, errors.New("小程序五张表的定义不完整")
	}
	return result, nil
}
func InitializeReaders(ctx context.Context, db *sql.DB, statements []string) error {
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return errors.New("小程序表创建失败，请检查数据库权限与现有表结构；未执行书目或字典写入")
		}
	}
	return nil
}
