// Package assets validates local or independently hosted import resources.
package assets

import (
	"context"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Options struct {
	WebDir      string
	BaseURL     string
	Mode        string
	Timeout     time.Duration
	Concurrency int
}

type Checker struct {
	opts   Options
	client *http.Client
}

func NewChecker(opts Options) (*Checker, error) {
	if opts.Mode == "" {
		opts.Mode = "auto"
	}
	if opts.Mode != "auto" && opts.Mode != "local" && opts.Mode != "remote" {
		return nil, fmt.Errorf("ASSET_CHECK_MODE 必须是 auto、local 或 remote")
	}
	if opts.Mode == "remote" && opts.BaseURL == "" {
		return nil, fmt.Errorf("远程资源校验需要 ASSET_BASE_URL")
	}
	if opts.BaseURL != "" {
		u, err := url.Parse(opts.BaseURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return nil, fmt.Errorf("ASSET_BASE_URL 必须是无账号、查询参数或片段的 http/https 地址")
		}
	}
	if opts.Timeout <= 0 {
		opts.Timeout = 10 * time.Second
	}
	if opts.Concurrency <= 0 {
		opts.Concurrency = 6
	}
	opts.BaseURL = strings.TrimRight(opts.BaseURL, "/")
	return &Checker{opts: opts, client: &http.Client{Timeout: opts.Timeout}}, nil
}

func SafePath(path string) bool {
	if !strings.HasPrefix(path, "/assets/") || strings.ContainsAny(path, "\\?#") {
		return false
	}
	decoded, err := url.PathUnescape(path)
	if err != nil || decoded != path {
		return false
	}
	for _, part := range strings.Split(path, "/") {
		if part == "." || part == ".." {
			return false
		}
	}
	return filepath.Ext(path) != ""
}

func (c *Checker) check(ctx context.Context, path string) error {
	if !SafePath(path) {
		return fmt.Errorf("无效素材路径 %s", path)
	}
	if c.opts.Mode != "remote" {
		local := filepath.Join(c.opts.WebDir, strings.TrimPrefix(path, "/"))
		info, err := os.Stat(local)
		if err == nil {
			if !info.Mode().IsRegular() || info.Size() == 0 {
				return fmt.Errorf("本地资源不是非空文件 %s", path)
			}
			return nil
		}
		if !os.IsNotExist(err) {
			return fmt.Errorf("无法检查本地资源 %s", path)
		}
		if c.opts.Mode == "local" || c.opts.BaseURL == "" {
			return fmt.Errorf("缺少本地资源 %s；已上传的素材可配置 ASSET_BASE_URL 进行远程校验", path)
		}
	}
	return c.checkRemote(ctx, path, false)
}

func (c *Checker) checkRemote(ctx context.Context, path string, get bool) error {
	method := http.MethodHead
	if get {
		method = http.MethodGet
	}
	req, err := http.NewRequestWithContext(ctx, method, c.opts.BaseURL+path, nil)
	if err != nil {
		return fmt.Errorf("无法创建资源检查请求 %s", path)
	}
	if get {
		req.Header.Set("Range", "bytes=0-0")
	}
	resp, err := c.client.Do(req)
	if err != nil {
		// Do not include a base URL that could contain deployment-specific data.
		return fmt.Errorf("远程资源检查失败 %s，请检查域名、网络或超时", path)
	}
	defer resp.Body.Close()
	if !get && (resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented) {
		resp.Body.Close()
		return c.checkRemote(ctx, path, true)
	}
	if resp.StatusCode != http.StatusOK && !(get && resp.StatusCode == http.StatusPartialContent) {
		return fmt.Errorf("远程资源 %s 返回 HTTP %d", path, resp.StatusCode)
	}
	mediaType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	kind := "image/"
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp3", ".wav", ".ogg", ".m4a":
		kind = "audio/"
	}
	if !strings.HasPrefix(mediaType, kind) {
		return fmt.Errorf("远程资源类型不正确 %s，预期 %s", path, kind)
	}
	if resp.ContentLength == 0 {
		return fmt.Errorf("远程资源为空 %s", path)
	}
	if get {
		var sample [1]byte
		if _, err := io.ReadFull(resp.Body, sample[:]); err != nil {
			return fmt.Errorf("远程资源为空或无法读取 %s", path)
		}
	} else if resp.ContentLength < 0 {
		resp.Body.Close()
		return c.checkRemote(ctx, path, true)
	}
	return nil
}

// Check deduplicates requests and bounds concurrency; a failure cancels the batch.
func (c *Checker) Check(ctx context.Context, paths []string) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	jobs := make(chan string)
	var workers sync.WaitGroup
	var first error
	var once sync.Once
	for range c.opts.Concurrency {
		workers.Go(func() {
			for path := range jobs {
				if ctx.Err() != nil {
					return
				}
				if err := c.check(ctx, path); err != nil {
					once.Do(func() { first = err; cancel() })
					return
				}
			}
		})
	}
	seen := map[string]bool{}
send:
	for _, path := range paths {
		if seen[path] {
			continue
		}
		seen[path] = true
		select {
		case jobs <- path:
		case <-ctx.Done():
			break send
		}
	}
	close(jobs)
	workers.Wait()
	if first != nil {
		return first
	}
	return ctx.Err()
}
