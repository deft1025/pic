// readerdb previews the five additive reader tables. --apply is deliberately explicit.
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
	apply := flag.Bool("apply", false, "执行选定小程序新表的CREATE IF NOT EXISTS；默认只预览SQL，不连接数据库")
	table := flag.String("table", "", "仅预览或创建指定的读者表，默认全部五张")
	flag.Parse()
	if err := run(*configFile, *apply, *table); err != nil {
		log.Fatal(err)
	}
}
func run(configFile string, apply bool, table string) error {
	cfg, err := config.Load(configFile)
	if err != nil {
		return err
	}
	statements, err := database.ReaderSchema(cfg.Content.Schema)
	if err != nil {
		return err
	}
	if table != "" {
		selected := []string{}
		for _, statement := range statements {
			if strings.HasPrefix(statement, "CREATE TABLE IF NOT EXISTS `"+table+"`") {
				selected = append(selected, statement)
			}
		}
		if len(selected) != 1 {
			return fmt.Errorf("未找到指定读者表")
		}
		statements = selected
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
	fmt.Println("选定小程序表已就绪。未改书目、物料、字典或账号服务开关。")
	return nil
}
