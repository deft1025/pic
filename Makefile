.PHONY: dev test build content dbinit import
dev:
	go run ./cmd/api
test:
	go test ./...
	python3 -m unittest discover -s tests -p 'test_*.py'
	node --check web/app.js
	node --test tests/flows.cjs
build:
	go build -o bin/pic ./cmd/api
	go build -o bin/dbinit ./cmd/dbinit
	go build -o bin/importer ./cmd/importer
content:
	python3 scripts/import_books.py content/books --validate-only
dbinit:
	go run ./cmd/dbinit
import:
	go run ./cmd/importer
