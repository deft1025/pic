// Package config loads the shared configuration for API, dbinit and importer.
package config

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Content  ContentConfig
}

type ServerConfig struct {
	Addr              string
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	ShutdownTimeout   time.Duration
}

type DatabaseConfig struct {
	Host            string
	Port            int
	User            string
	Password        string
	Name            string
	TLS             bool
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	ConnMaxIdleTime time.Duration
	ConnectTimeout  time.Duration
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
}

type ContentConfig struct {
	WebDir                 string
	AssetBaseURL           string
	AssetCheckMode         string
	AssetCheckTimeout      time.Duration
	AssetCheckConcurrency  int
	Dir                    string
	Schema                 string
	RequireLicenseApproval bool
}

// Load reads .env by default, or CONFIG_FILE / the explicit path. Environment
// variables take precedence, including explicitly empty values. It never changes
// process environment or includes secret values in validation errors.
func Load(path string) (*Config, error) {
	if path == "" {
		path = os.Getenv("CONFIG_FILE")
	}
	optional := path == ""
	if optional {
		path = ".env"
	}
	values := map[string]string{}
	data, err := os.ReadFile(path)
	if err != nil {
		if !optional || !errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("无法读取配置文件 %s", path)
		}
	} else {
		values, err = godotenv.Unmarshal(string(data))
		if err != nil {
			return nil, errors.New("配置文件格式无效，请检查 KEY=VALUE 和引号")
		}
	}
	value := func(key, fallback string) string {
		if v, ok := os.LookupEnv(key); ok {
			return v
		}
		if v, ok := values[key]; ok {
			return v
		}
		return fallback
	}
	cfg := &Config{
		Server:   ServerConfig{Addr: value("HTTP_ADDR", "127.0.0.1:8198")},
		Database: DatabaseConfig{Host: value("DB_HOST", "127.0.0.1"), User: value("DB_USER", "pic"), Password: value("DB_PASSWORD", ""), Name: value("DB_NAME", "pic")},
		Content:  ContentConfig{WebDir: value("WEB_DIR", "web"), AssetBaseURL: value("ASSET_BASE_URL", ""), AssetCheckMode: value("ASSET_CHECK_MODE", "auto"), Dir: value("CONTENT_DIR", "content/books"), Schema: value("SCHEMA_FILE", "docs/schema.sql")},
	}
	for _, item := range []struct {
		key                string
		dest               *int
		fallback, min, max int
	}{
		{"DB_PORT", &cfg.Database.Port, 3306, 1, 65535},
		{"DB_MAX_OPEN_CONNS", &cfg.Database.MaxOpenConns, 10, 1, 10000},
		{"DB_MAX_IDLE_CONNS", &cfg.Database.MaxIdleConns, 5, 0, 10000},
		{"ASSET_CHECK_CONCURRENCY", &cfg.Content.AssetCheckConcurrency, 6, 1, 32},
	} {
		n, e := strconv.Atoi(value(item.key, strconv.Itoa(item.fallback)))
		if e != nil || n < item.min || n > item.max {
			return nil, fmt.Errorf("%s 必须是 %d–%d 的整数", item.key, item.min, item.max)
		}
		*item.dest = n
	}
	for _, item := range []struct {
		key      string
		dest     *time.Duration
		fallback string
	}{
		{"HTTP_READ_HEADER_TIMEOUT", &cfg.Server.ReadHeaderTimeout, "5s"},
		{"HTTP_READ_TIMEOUT", &cfg.Server.ReadTimeout, "15s"},
		{"HTTP_WRITE_TIMEOUT", &cfg.Server.WriteTimeout, "30s"},
		{"HTTP_IDLE_TIMEOUT", &cfg.Server.IdleTimeout, "60s"},
		{"HTTP_SHUTDOWN_TIMEOUT", &cfg.Server.ShutdownTimeout, "10s"},
		{"DB_CONNECT_TIMEOUT", &cfg.Database.ConnectTimeout, "5s"},
		{"DB_READ_TIMEOUT", &cfg.Database.ReadTimeout, "10s"},
		{"DB_WRITE_TIMEOUT", &cfg.Database.WriteTimeout, "15s"},
		{"DB_CONN_MAX_LIFETIME", &cfg.Database.ConnMaxLifetime, "3m"},
		{"DB_CONN_MAX_IDLE_TIME", &cfg.Database.ConnMaxIdleTime, "1m"},
		{"ASSET_CHECK_TIMEOUT", &cfg.Content.AssetCheckTimeout, "10s"},
	} {
		d, e := time.ParseDuration(value(item.key, item.fallback))
		if e != nil || d <= 0 {
			return nil, fmt.Errorf("%s 必须是正时长，例如 5s 或 3m", item.key)
		}
		*item.dest = d
	}
	for _, item := range []struct {
		key  string
		dest *bool
	}{
		{"DB_TLS", &cfg.Database.TLS}, {"REQUIRE_LICENSE_APPROVAL", &cfg.Content.RequireLicenseApproval},
	} {
		b, e := strconv.ParseBool(value(item.key, "false"))
		if e != nil {
			return nil, fmt.Errorf("%s 必须是 true 或 false", item.key)
		}
		*item.dest = b
	}
	_, port, e := net.SplitHostPort(cfg.Server.Addr)
	p, portErr := strconv.Atoi(port)
	if e != nil || portErr != nil || p < 1 || p > 65535 {
		return nil, errors.New("HTTP_ADDR 必须是有效的 host:port 地址")
	}
	if !regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString(cfg.Database.Name) {
		return nil, errors.New("DB_NAME 仅允许字母、数字和下划线")
	}
	if cfg.Database.Host == "" || cfg.Database.User == "" {
		return nil, errors.New("DB_HOST 和 DB_USER 不可为空")
	}
	if cfg.Database.MaxIdleConns > cfg.Database.MaxOpenConns {
		return nil, errors.New("DB_MAX_IDLE_CONNS 不可大于 DB_MAX_OPEN_CONNS")
	}
	if cfg.Content.Dir == "" || cfg.Content.WebDir == "" || cfg.Content.Schema == "" {
		return nil, errors.New("CONTENT_DIR、WEB_DIR 和 SCHEMA_FILE 不可为空")
	}
	if raw := cfg.Content.AssetBaseURL; raw != "" {
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.Contains(raw, "#") || strings.ContainsAny(raw, " \t\r\n\\\"'`;<>*") {
			return nil, errors.New("ASSET_BASE_URL 必须是 http/https 地址，不含账号、查询参数或片段；留空使用本地资源")
		}
		cfg.Content.AssetBaseURL = strings.TrimRight(raw, "/")
	}
	if cfg.Content.AssetCheckMode != "auto" && cfg.Content.AssetCheckMode != "local" && cfg.Content.AssetCheckMode != "remote" {
		return nil, errors.New("ASSET_CHECK_MODE 必须是 auto、local 或 remote")
	}
	if cfg.Content.AssetCheckMode == "remote" && cfg.Content.AssetBaseURL == "" {
		return nil, errors.New("ASSET_CHECK_MODE=remote 需要设置 ASSET_BASE_URL")
	}
	return cfg, nil
}
