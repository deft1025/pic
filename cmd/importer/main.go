package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	"pic/internal/assets"
	"pic/internal/config"
	"pic/internal/database"
	"pic/internal/importer"
	"pic/internal/repository"
)

func main() {
	configFile := flag.String("config", "", "配置文件路径（默认 .env，可由 CONFIG_FILE 指定）")
	content := flag.String("content", "", "覆盖配置中的绘本 JSON 目录")
	web := flag.String("web", "", "覆盖配置中的本地资源根目录")
	status := flag.String("status", "", "可选统一状态：published / draft / offline")
	validate := flag.Bool("validate-only", false, "校验资料及本地/远程资源，不连接数据库")
	flag.Parse()
	if err := run(*configFile, *content, *web, *status, *validate); err != nil {
		log.Fatal(err)
	}
}

func run(configFile, content, web, status string, validate bool) error {
	cfg, err := config.Load(configFile)
	if err != nil {
		return err
	}
	if content == "" {
		content = cfg.Content.Dir
	}
	if web == "" {
		web = cfg.Content.WebDir
	}
	checker, err := assets.NewChecker(assets.Options{WebDir: web, BaseURL: cfg.Content.AssetBaseURL, Mode: cfg.Content.AssetCheckMode, Timeout: cfg.Content.AssetCheckTimeout, Concurrency: cfg.Content.AssetCheckConcurrency})
	if err != nil {
		return err
	}
	batch, err := importer.LoadWithAssets(content, status, cfg.Content.RequireLicenseApproval, func(paths []string) error { return checker.Check(context.Background(), paths) })
	if err != nil {
		return err
	}
	if validate {
		fmt.Printf("文件校验通过：%d 本绘本，%d 页。\n", len(batch.Books), batch.Pages)
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := database.Open(ctx, cfg.Database)
	if err != nil {
		return err
	}
	defer db.Close()
	if err = repository.New(db, cfg.Content.RequireLicenseApproval).Import(ctx, batch.Books); err != nil {
		return err
	}
	fmt.Printf("MySQL 导入完成：%d 本绘本，%d 页。接口立即读取新数据，无需重启。\n", len(batch.Books), batch.Pages)
	return nil
}
