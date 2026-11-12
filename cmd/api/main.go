package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pic/internal/config"
	"pic/internal/database"
	"pic/internal/repository"
	"pic/internal/router"
	"pic/internal/service"
)

func main() {
	configFile := flag.String("config", "", "配置文件路径（默认 .env，可由 CONFIG_FILE 指定）")
	flag.Parse()
	if err := run(*configFile); err != nil {
		log.Fatal(err)
	}
}

func run(configFile string) error {
	cfg, err := config.Load(configFile)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	db, err := database.Open(ctx, cfg.Database)
	cancel()
	if err != nil {
		return err
	}
	defer db.Close()
	library := service.NewLibrary(repository.New(db, cfg.Content.RequireLicenseApproval), cfg.Content.AssetBaseURL)
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	_, err = library.Health(ctx)
	cancel()
	if err != nil {
		return errors.New("MySQL 内容表未就绪，请先运行 cmd/dbinit 和 cmd/importer")
	}

	server := &http.Server{
		Addr:              cfg.Server.Addr,
		Handler:           router.New(library, cfg.Content.WebDir, cfg.Content.AssetBaseURL, cfg.Server.SiteBaseURL),
		ReadHeaderTimeout: cfg.Server.ReadHeaderTimeout,
		ReadTimeout:       cfg.Server.ReadTimeout,
		WriteTimeout:      cfg.Server.WriteTimeout,
		IdleTimeout:       cfg.Server.IdleTimeout,
		MaxHeaderBytes:    1 << 20,
	}
	stop, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()
	failure := make(chan error, 1)
	go func() { failure <- server.ListenAndServe() }()
	log.Printf("小小绘本馆 http://%s · MySQL", server.Addr)
	select {
	case err := <-failure:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("HTTP 服务启动失败: %w", err)
	case <-stop.Done():
		stopSignals()
		ctx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			_ = server.Close()
			return fmt.Errorf("HTTP 服务关闭失败: %w", err)
		}
		return nil
	}
}
