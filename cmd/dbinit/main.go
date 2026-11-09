package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"time"

	"pic/internal/config"
	"pic/internal/database"
)

func main() {
	configFile := flag.String("config", "", "配置文件路径（默认 .env，可由 CONFIG_FILE 指定）")
	schema := flag.String("schema", "", "覆盖配置中的 MySQL 建表 SQL 路径")
	create := flag.Bool("create-database", false, "创建配置中的数据库（要求 CREATE DATABASE 权限）")
	flag.Parse()
	if err := run(*configFile, *schema, *create); err != nil {
		log.Fatal(err)
	}
}

func run(configFile, schema string, create bool) error {
	cfg, err := config.Load(configFile)
	if err != nil {
		return err
	}
	if schema == "" {
		schema = cfg.Content.Schema
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if create {
		admin := cfg.Database
		admin.Name = ""
		db, err := database.Open(ctx, admin)
		if err != nil {
			return err
		}
		_, err = db.ExecContext(ctx, "CREATE DATABASE IF NOT EXISTS `"+cfg.Database.Name+"` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
		db.Close()
		if err != nil {
			return fmt.Errorf("创建数据库失败，请检查数据库权限")
		}
	}
	db, err := database.Open(ctx, cfg.Database)
	if err != nil {
		return err
	}
	defer db.Close()
	if err = database.Initialize(ctx, db, schema); err != nil {
		return err
	}
	fmt.Println("MySQL 数据表及年龄、主题、语言字典初始化完成。")
	return nil
}
