# Development Guide

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Go | 1.25 | https://go.dev/dl |
| Node.js | 20 | https://nodejs.org |
| npm | 10 | Bundled with Node |
| Docker (optional) | 24 | https://docs.docker.com/get-docker |

## Local Setup

```bash
# 1. Clone
git clone https://github.com/riorescue/somnatrace.git
cd somnatrace

# 2. Install Go dependencies
go mod download

# 3. Install frontend dependencies
cd web && npm install && cd ..

# 4. Start development servers
./scripts/dev.sh
```

Two servers start:
- **Go API** at `http://127.0.0.1:8080` — handles `/api/v1/*`
- **Vite dev server** at `http://127.0.0.1:5173` — serves the React app with HMR

Open [http://localhost:5173](http://localhost:5173) for development. The Vite proxy forwards all `/api/*` requests to the Go server automatically.

To start them independently:

```bash
# Go API only
make api

# Vite dev server only (in web/)
make ui
```

## Available Commands

| Command | What it does |
|---|---|
| `make dev` | Start both servers (API + UI) |
| `make api` | Go API only |
| `make ui` | Vite dev server only |
| `make build` | Full production build |
| `make build-ui` | Frontend only (outputs to `internal/web/dist/`) |
| `make build-go` | Go binary only (requires `dist/` to exist) |
| `make seed` | Seed 30 days of synthetic sessions |
| `make seed DAYS=N` | Seed N days of synthetic sessions |
| `make test` | `go test ./...` |
| `make lint` | `go vet` + TypeScript type-check |
| `make clean` | Remove binary and build artifacts |

## Seeding Synthetic Data

The seed command generates realistic CPAP session data for development without needing a real SD card. Each run creates a new random device and a fresh import record.

```bash
# Default — 30 days
make seed

# A full year of data
make seed DAYS=365

# Target a specific database
go run ./cmd/seed/ --days 90 --db /path/to/somnatrace.db
```

The seed command requires the server to have been started at least once (so migrations have been applied). Running it multiple times adds additional devices — it does not overwrite existing data.

## Frontend ↔ Backend Interaction

### Development

```
Browser (5173)
  ├── HTML/JS/CSS served by Vite (HMR enabled)
  └── /api/* → proxied to Go on 8080
        └── JSON responses
```

The proxy is configured in [web/vite.config.ts](../web/vite.config.ts).

### Production

```
Browser
  └── All requests → Go binary (port 8080)
        ├── /api/* → API handlers
        └── /* → embedded frontend files (SPA fallback to index.html)
```

The `make build-ui` command compiles the frontend to `internal/web/dist/`. The `//go:embed all:dist` directive in `internal/web/embed.go` bakes those files into the Go binary at compile time.

## Adding a New API Endpoint

1. Add the service method in `internal/service/`.
2. Add the handler function in `internal/api/handlers/`.
3. Register the route in `internal/api/router.go`.
4. Add the corresponding API client method in `web/src/lib/api.ts`.
5. Add any new response types to `web/src/types/index.ts`.
6. Consume it with `useQuery` (or `useMutation`) in the relevant feature component.

## Adding a New Migration

1. Create `migrations/NNN_description.sql` (increment the numeric prefix).
2. Write idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`).
3. Restart the server — migrations run automatically on startup via `db.ApplyMigrations`.

Current highest migration: `010_leak_settings.sql`.

## Adding a New Analysis Rule

1. Implement the `Rule` interface in the appropriate `internal/analysis/rules_*.go` file (or create a new one).
2. Register it in `DefaultEngine()` in `engine.go`.
3. No schema change or API change is needed — `rule_settings` automatically picks up any new rule ID.

## Adding a New Device Family

1. Create `internal/machine/<family>/` with device-specific parsers.
2. Update `internal/machine/detector.go` to recognize the new family's directory signature.
3. Register the new `DeviceFamily` constant in `internal/models/device.go`.
4. Implement `importer.Importer` and register it in `internal/service/imports.go`'s switch statement.

## Working with Real SD Card Data

Insert the device SD card and navigate to the **Imports** page. The page automatically scans mounted volumes for ResMed cards (`Identification.json` presence). Clicking a detected card pre-fills the import form.

For ResMed AirSense 11:
- SD card root must contain `Identification.json` and `SETTINGS/CurrentSettings.json`
- Session EDF files live under `DATALOG/YYYYMMDD/` as `.edf` bundles (BRP, PLD, SA2, CSL, EVE)
- Timezone is read from `CurrentSettings.json` → `TimeZoneFeature.TimeZoneOffset`

## Project Conventions

- **Go packages** are small and purposeful. No circular imports.
- **Models** (`internal/models/`) are plain structs with JSON tags. No methods.
- **Services** own all database interactions and business rules.
- **Handlers** contain no business logic — they parse, delegate, and respond.
- **Frontend** uses TanStack Query for all data fetching. No global state store.
- **CSS** is Tailwind utilities + a small set of named component classes in `globals.css`.
- **Migrations** are append-only. Never modify an applied migration file.
- **Re-imports** are safe — all session-scoped inserts use `ON CONFLICT ... DO UPDATE`.

## Database Location

The SQLite database lives at `~/.somnatrace/somnatrace.db` by default. WAL sidecar files (`-wal`, `-shm`) are normal during operation. The Utilities page exposes Vacuum to merge WAL into the main file and reclaim space.

Database backups are stored in `~/.somnatrace/backups/` as clean single-file snapshots (no WAL sidecar).

To inspect the database directly:

```bash
sqlite3 ~/.somnatrace/somnatrace.db
```

Useful queries:

```sql
-- Check applied migrations
SELECT * FROM schema_migrations ORDER BY applied_at;

-- Count rows per table
SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'session_signals', COUNT(*) FROM session_signals
UNION ALL SELECT 'settings_snapshots', COUNT(*) FROM settings_snapshots
UNION ALL SELECT 'device_identification_snapshots', COUNT(*) FROM device_identification_snapshots;

-- View current app settings
SELECT key, value FROM app_settings;

-- View rule enable/disable state
SELECT rule_id, enabled FROM rule_settings ORDER BY rule_id;
```
