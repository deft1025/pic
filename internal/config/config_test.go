package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func cleanEnv(t *testing.T) {
	t.Helper()
	for _, entry := range os.Environ() {
		key, _, _ := strings.Cut(entry, "=")
		if strings.HasPrefix(key, "DB_") || strings.HasPrefix(key, "HTTP_") || strings.HasPrefix(key, "ASSET_") || key == "CONFIG_FILE" || key == "CONTENT_DIR" || key == "WEB_DIR" || key == "SCHEMA_FILE" || key == "REQUIRE_LICENSE_APPROVAL" {
			t.Setenv(key, "")
			os.Unsetenv(key)
		}
	}
}
func file(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "pic.env")
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}
func TestFileEnvironmentAndDefaults(t *testing.T) {
	cleanEnv(t)
	path := file(t, `HTTP_ADDR=:8298
DB_HOST=db.internal
DB_PORT=3307
DB_NAME=pic_file
DB_USER=reader
DB_PASSWORD='p@ss:/?#${literal}'
DB_TLS=true
DB_MAX_OPEN_CONNS=12
DB_MAX_IDLE_CONNS=4
DB_CONNECT_TIMEOUT=8s
CONTENT_DIR=/srv/books
WEB_DIR=/srv/web
SCHEMA_FILE=/srv/schema.sql
REQUIRE_LICENSE_APPROVAL=false
`)
	t.Setenv("HTTP_ADDR", "127.0.0.1:8398")
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Server.Addr != "127.0.0.1:8398" || cfg.Database.Port != 3307 || cfg.Database.Name != "pic_file" || cfg.Database.Password != "p@ss:/?#${literal}" || !cfg.Database.TLS {
		t.Fatal("file/environment precedence or quoting failed")
	}
	if cfg.Database.MaxOpenConns != 12 || cfg.Database.MaxIdleConns != 4 || cfg.Database.ConnectTimeout != 8*time.Second || cfg.Server.ShutdownTimeout != 10*time.Second {
		t.Fatal("connection/server settings lost")
	}
	if cfg.Content.Dir != "/srv/books" || cfg.Content.WebDir != "/srv/web" || cfg.Content.Schema != "/srv/schema.sql" || cfg.Content.RequireLicenseApproval {
		t.Fatal("content settings lost")
	}
	if _, ok := os.LookupEnv("DB_PASSWORD"); ok {
		t.Fatal("file loading changed process environment")
	}
	t.Setenv("DB_PASSWORD", "")
	cfg, err = Load(path)
	if err != nil || cfg.Database.Password != "" {
		t.Fatal("explicit empty environment value must override the file")
	}
}
func TestDefaultFileAndExplicitFileSelection(t *testing.T) {
	cleanEnv(t)
	t.Chdir(t.TempDir())
	cfg, err := Load("")
	if err != nil || cfg.Server.Addr != "127.0.0.1:8198" || cfg.Content.RequireLicenseApproval {
		t.Fatal("missing optional .env must preserve defaults", err)
	}
	if err := os.WriteFile(".env", []byte("DB_NAME=pic_default\n"), 0600); err != nil {
		t.Fatal(err)
	}
	cfg, err = Load("")
	if err != nil || cfg.Database.Name != "pic_default" {
		t.Fatal("default .env was not loaded", err)
	}
	selected := file(t, "DB_NAME=pic_selected\n")
	t.Setenv("CONFIG_FILE", selected)
	cfg, err = Load("")
	if err != nil || cfg.Database.Name != "pic_selected" {
		t.Fatal("CONFIG_FILE ignored", err)
	}
	explicit := file(t, "DB_NAME=pic_explicit\n")
	cfg, err = Load(explicit)
	if err != nil || cfg.Database.Name != "pic_explicit" {
		t.Fatal("explicit file must override CONFIG_FILE", err)
	}
	if _, err = Load("missing.env"); err == nil {
		t.Fatal("missing explicit file silently ignored")
	}
}
func TestInvalidConfigurationFailsWithoutDisclosingValues(t *testing.T) {
	for _, entry := range []string{
		"DB_PORT=70000", "DB_PORT=secret-value", "HTTP_ADDR=invalid", "DB_NAME=secret-value;DROP", "DB_TLS=secret-value", "REQUIRE_LICENSE_APPROVAL=secret-value", "DB_MAX_OPEN_CONNS=-1", "DB_MAX_IDLE_CONNS=11", "DB_CONNECT_TIMEOUT=0s", "HTTP_READ_TIMEOUT=secret-value", "WEB_DIR=", "DB_USER=",
	} {
		t.Run(strings.Split(entry, "=")[0]+entry, func(t *testing.T) {
			cleanEnv(t)
			_, err := Load(file(t, entry+"\n"))
			if err == nil {
				t.Fatal("invalid configuration accepted")
			}
			if strings.Contains(err.Error(), "secret-value") {
				t.Fatal("invalid value leaked")
			}
		})
	}
	cleanEnv(t)
	_, err := Load(file(t, "DB_PASSWORD='secret-value\n"))
	if err == nil || strings.Contains(err.Error(), "secret-value") {
		t.Fatal("parse errors must not leak credentials")
	}
}

func TestAssetBaseURL(t *testing.T) {
	cleanEnv(t)
	path := file(t, "ASSET_BASE_URL=https://media.example.com/pic/\n")
	cfg, err := Load(path)
	if err != nil || cfg.Content.AssetBaseURL != "https://media.example.com/pic" {
		t.Fatal("asset base URL was not loaded and normalized", err)
	}
	t.Setenv("ASSET_BASE_URL", "")
	cfg, err = Load(path)
	if err != nil || cfg.Content.AssetBaseURL != "" {
		t.Fatal("empty environment override must restore local assets", err)
	}
	for _, raw := range []string{"/assets", "//media.example.com", "javascript:alert(1)", "https://user:secret-value@media.example.com", "https://media.example.com?token=secret-value", "https://media.example.com#fragment", "https://media.example.com;", "https://*.example.com"} {
		t.Setenv("ASSET_BASE_URL", raw)
		_, err := Load(path)
		if err == nil || strings.Contains(err.Error(), "secret-value") {
			t.Fatalf("invalid asset URL accepted or leaked: %v", err)
		}
	}
}

func TestAssetCheckConfiguration(t *testing.T) {
	cleanEnv(t)
	path := file(t, "ASSET_BASE_URL=https://media.example.com\nASSET_CHECK_MODE=remote\nASSET_CHECK_TIMEOUT=4s\nASSET_CHECK_CONCURRENCY=3\n")
	cfg, err := Load(path)
	if err != nil || cfg.Content.AssetCheckMode != "remote" || cfg.Content.AssetCheckTimeout != 4*time.Second || cfg.Content.AssetCheckConcurrency != 3 {
		t.Fatal("asset check settings lost", err)
	}
	for key, value := range map[string]string{"ASSET_CHECK_MODE": "invalid", "ASSET_CHECK_TIMEOUT": "0s", "ASSET_CHECK_CONCURRENCY": "33", "ASSET_BASE_URL": ""} {
		t.Run(key, func(t *testing.T) {
			t.Setenv(key, value)
			if _, err := Load(path); err == nil {
				t.Fatal("invalid asset check settings accepted")
			}
		})
	}
}
