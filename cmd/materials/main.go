// Local-only database bridge for book production. No API server or schema change.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"pic/internal/assets"
	"pic/internal/config"
	"pic/internal/database"
	"pic/internal/repository"
	"pic/internal/service"
)

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "物料操作失败：", err)
		os.Exit(1)
	}
}

func run(args []string, input io.Reader, output io.Writer) error {
	if len(args) == 0 {
		return errors.New("用法：materials list | read --book ID | save（从标准输入接收工具数据）")
	}
	action := args[0]
	fs := flag.NewFlagSet("materials "+action, flag.ContinueOnError)
	id := fs.String("book", "", "绘本业务ID")
	configFile := fs.String("config", "", "数据库配置文件，默认项目根目录.env")
	metadataOnly := fs.Bool("metadata-only", false, "仅写正文与元数据，资源存在性留待制作后validate；不代表物料已完成")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if fs.NArg() != 0 || (action != "list" && action != "read" && action != "save" && action != "validate") {
		return errors.New("无效操作或参数")
	}
	if (action == "read" || action == "validate") && *id == "" {
		return errors.New("read 必须指定 --book ID")
	}
	var payload repository.MaterialSnapshot
	if action == "save" {
		decoder := json.NewDecoder(io.LimitReader(input, 16<<20))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil {
			return errors.New("无法读取书目操作数据")
		}
		var extra any
		if err := decoder.Decode(&extra); err != io.EOF {
			return errors.New("标准输入只能包含一本书的操作数据")
		}
		if *id != "" && *id != payload.Book.ID {
			return errors.New("书目ID不一致")
		}
	}
	cfg, err := config.Load(*configFile)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := database.Open(ctx, cfg.Database)
	if err != nil {
		return err
	}
	defer db.Close()
	m := service.NewMaterials(repository.New(db, cfg.Content.RequireLicenseApproval), cfg.Content.RequireLicenseApproval)
	encoder := json.NewEncoder(output)
	var check func([]string) error
	if action == "validate" || action == "save" && !*metadataOnly {
		checker, e := assets.NewChecker(assets.Options{WebDir: cfg.Content.WebDir, BaseURL: cfg.Content.AssetBaseURL, Mode: cfg.Content.AssetCheckMode, Timeout: cfg.Content.AssetCheckTimeout, Concurrency: cfg.Content.AssetCheckConcurrency})
		if e != nil {
			return e
		}
		check = func(paths []string) error { return checker.Check(ctx, paths) }
	}
	switch action {
	case "list":
		ids, e := m.IDs(ctx)
		if e != nil {
			return e
		}
		return encoder.Encode(ids)
	case "read":
		snapshot, e := m.Read(ctx, *id)
		if e != nil {
			return e
		}
		return encoder.Encode(snapshot)
	case "validate":
		snapshot, e := m.Read(ctx, *id)
		if e != nil {
			return e
		}
		if e = m.Validate(snapshot.Book, check); e != nil {
			return e
		}
		return encoder.Encode(map[string]string{"status": "valid", "book_id": *id})
	case "save":
		if e := m.Save(ctx, payload, check); e != nil {
			return e
		}
		return encoder.Encode(map[string]string{"status": "saved", "book_id": payload.Book.ID})
	}
	return nil
}
