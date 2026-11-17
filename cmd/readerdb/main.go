// readerdb previews the four additive reader tables. --apply is deliberately explicit.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"strings"
	"time"

	"pic/internal/config"
	"pic/internal/database"
)

func main() {
	configFile := flag.String("config", "", "配置文件路径，默认.env")
	apply := flag.Bool("apply", false, "执行四张小程序新表的CREATE IF NOT EXISTS；默认只预览SQL，不连接数据库")
	flag.Parse()
	if err := run(*configFile, *apply); err != nil {
		log.Fatal(err)
	}
}
func run(configFile string, apply bool) error {
	cfg, err := config.Load(configFile)
	if err != nil {
		return err
	}
	statements, err := database.ReaderSchema(cfg.Content.Schema)
	if err != nil {
		return err
	}
	if !apply {
		fmt.Println(strings.Join(statements, "\n\n"))
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	db, err := database.Open(ctx, cfg.Database)
	if err != nil {
		return err
	}
	defer db.Close()
	if err = database.InitializeReaders(ctx, db, statements); err != nil {
		return err
	}
	fmt.Println("小程序四张表已就绪。未改书目、物料、字典或账号服务开关。")
	return nil
}
