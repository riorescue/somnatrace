BINARY   := somnatrace
PKG      := ./cmd/somnatrace
VERSION  := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
LDFLAGS  := -ldflags "-X github.com/somnatrace/somnatrace/internal/config.Version=$(VERSION)"

.PHONY: all build api ui dev test clean docker-build docker-up seed help

all: build

## build: compile frontend + Go binary with embedded assets
build: build-ui build-go

## build-go: compile the Go binary only
build-go:
	@echo "→ Building $(BINARY)…"
	go build $(LDFLAGS) -o $(BINARY) $(PKG)

## build-ui: compile the Vite frontend into internal/web/dist/
build-ui:
	@echo "→ Building frontend…"
	cd web && npm run build

## api: run the Go API server in development mode
api:
	SOMNATRACE_MODE=development go run $(PKG)

## ui: run the Vite dev server (proxies /api → :8080)
ui:
	cd web && npm run dev

## dev: run both API and UI in parallel (requires a terminal multiplexer or background jobs)
dev:
	@echo "→ Starting API (port 8080) and UI (port 5173)…"
	@$(MAKE) api &
	@cd web && npm run dev

## seed: seed 30 days of synthetic sessions (use DAYS=N to override)
seed:
	go run ./cmd/seed/ --days $(or $(DAYS),30)

## test: run all Go tests
test:
	go test ./...

## test-v: run all Go tests with verbose output
test-v:
	go test -v ./...

## lint: run Go vet and TypeScript type-check
lint:
	go vet ./...
	cd web && npm run lint

## clean: remove build artefacts
clean:
	rm -f $(BINARY)
	rm -rf internal/web/dist
	find . -name '*.db' -not -path './.git/*' -delete

## docker-build: build the Docker image
docker-build:
	docker build -t somnatrace:latest .

## docker-up: start with docker compose
docker-up:
	docker compose up

## help: show this help
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## //' | column -t -s ':'
