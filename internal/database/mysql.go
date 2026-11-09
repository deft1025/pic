// Package database creates MySQL connections and initializes the trusted schema.
package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"pic/internal/config"

	"github.com/go-sql-driver/mysql"
)

// DriverConfig preserves special characters in credentials without DSN interpolation.
func DriverConfig(d config.DatabaseConfig) *mysql.Config {
	c := mysql.NewConfig()
	c.Net = "tcp"
	c.Addr = net.JoinHostPort(d.Host, strconv.Itoa(d.Port))
	c.DBName = d.Name
	c.User = d.User
	c.Passwd = d.Password
	c.ParseTime = true
	c.Loc = time.UTC
	c.Timeout = d.ConnectTimeout
	c.ReadTimeout = d.ReadTimeout
	c.WriteTimeout = d.WriteTimeout
	c.Params = map[string]string{"charset": "utf8mb4", "time_zone": "'+00:00'"}
	c.TLSConfig = strconv.FormatBool(d.TLS)
	return c
}

func Open(ctx context.Context, cfg config.DatabaseConfig) (*sql.DB, error) {
	db, err := sql.Open("mysql", DriverConfig(cfg).FormatDSN())
	if err != nil {
		return nil, errors.New("MySQL 配置无效，请检查配置文件中的 DB_* 参数")
	}
	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MaxIdleConns)
	db.SetConnMaxLifetime(cfg.ConnMaxLifetime)
	db.SetConnMaxIdleTime(cfg.ConnMaxIdleTime)
	if err = db.PingContext(ctx); err != nil {
		db.Close()
		return nil, errors.New("无法连接 MySQL，请检查 DB_* 配置、数据库是否存在以及网络是否可达")
	}
	return db, nil
}

// Initialize executes the trusted project schema one statement at a time.
// MultiStatements remains disabled for application and importer connections.
func Initialize(ctx context.Context, db *sql.DB, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("读取建表 SQL: %w", err)
	}
	for i, statement := range strings.Split(string(data), ";") {
		if strings.TrimSpace(statement) == "" {
			continue
		}
		if _, err = db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("建表 SQL 第 %d 段执行失败: %w", i+1, err)
		}
	}
	return nil
}
