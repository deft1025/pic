package repository

import (
	"errors"

	"github.com/go-sql-driver/mysql"
)

// ReaderSchemaProblem returns fixed labels, never driver messages or SQL values.
func ReaderSchemaProblem(err error) string {
	var problem *mysql.MySQLError
	if errors.As(err, &problem) {
		switch problem.Number {
		case 1146:
			return "reader_table_missing"
		case 1054, 1364:
			return "reader_schema_mismatch"
		}
	}
	return ""
}
