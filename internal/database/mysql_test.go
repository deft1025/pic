package database

import (
	"strings"
	"testing"
	"time"

	"pic/internal/config"
)

func TestDriverConfigPreservesCredentialsAndTimeouts(t *testing.T) {
	cfg := config.DatabaseConfig{Host: "::1", Port: 3307, Name: "pic_test", User: "reader", Password: "p@ss:/?#&", TLS: true, ConnectTimeout: 3 * time.Second, ReadTimeout: 7 * time.Second, WriteTimeout: 11 * time.Second}
	c := DriverConfig(cfg)
	if c.Passwd != cfg.Password || c.DBName != cfg.Name || c.User != cfg.User || !c.ParseTime || c.Loc != time.UTC || c.MultiStatements {
		t.Fatal("invalid DB configuration")
	}
	if c.Addr != "[::1]:3307" || c.TLSConfig != "true" || !strings.Contains(c.Params["time_zone"], "+00:00") {
		t.Fatal("address, TLS or UTC not configured")
	}
	if c.Timeout != cfg.ConnectTimeout || c.ReadTimeout != cfg.ReadTimeout || c.WriteTimeout != cfg.WriteTimeout {
		t.Fatal("configured timeouts were lost")
	}
}
