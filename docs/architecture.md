# Architecture

SomnaTrace is organized in five layers that each have a narrow responsibility. The boundaries between layers are explicit Go package boundaries — callers depend only on the layer directly below them.

```
┌─────────────────────────────────────────┐
│  Web UI  (React, Vite, TypeScript)       │
└─────────────────┬───────────────────────┘
                  │  JSON over HTTP
┌─────────────────▼───────────────────────┐
│  API Layer  (net/http, handlers)         │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  Service Layer  (business logic)         │
└──────────┬──────────────┬───────────────┘
           │              │              │
┌──────────▼──────┐  ┌────▼──────┐  ┌───▼──────────────┐
│  Storage Layer  │  │ Importer  │  │  Analysis Engine  │
│  (SQLite, db/)  │  │ / Parser  │  │  (analysis/)      │
└─────────────────┘  └───────────┘  └──────────────────┘
```

## Layers

### 1. Parser Layer (`internal/edf/`, `internal/machine/`)

Raw binary readers. The `edf` package reads European Data Format files: 256-byte file header, per-signal headers, and int16 little-endian data records, including EDF+D annotation tracks (TAL parsing for event files). The `machine` package contains device-specific logic behind a `Detector` interface:

- `machine.Detector` identifies a device family from a directory (currently by checking for `Identification.json`).
- `machine/resmed` contains all ResMed-specific logic:
  - `identification.go` — parses `Identification.json` (product info, serial, firmware) and returns raw JSON for storage.
  - `settings.go` — parses `CurrentSettings.json` for raw JSON storage and timezone extraction.
  - `decoder.go`, `layout.go`, `sessionfiles.go` — EDF file discovery and decoding.
  - `str.go` — STR.edf daily summary parsing (78-signal format).
  - `mapper.go` — maps raw EDF signals to normalized model fields.
  - `events.go` — maps EDF+ annotation text from EVE files to `models.EventType` values.

Other device families extend this by adding new sub-packages and implementing the same interfaces.

### 2. Importer Layer (`internal/importer/`)

The import pipeline:
1. The service layer calls `machine.Detector.Detect(path)` to identify the device family.
2. The appropriate `Importer` implementation is instantiated (`ResMedImporter`).
3. `Importer.Run(ctx, source)` returns a `Result` containing:
   - `Device` — device record for upsert
   - `Sessions` — slice of `SessionRecord`, each with signals pre-extracted
   - `SettingsPayload` — raw `CurrentSettings.json` bytes
   - `IdentificationPayload` — raw `Identification.json` bytes
4. The service layer persists all records, calling `storeSignals`, `storeSettings`, and `storeIdentification` for each session.

`MockImporter` implements the same interface and returns synthetic data, enabling UI development without real device files.

### 3. Storage Layer (`internal/db/`)

SQLite accessed through `database/sql` with `modernc.org/sqlite` (pure-Go, no CGo). Two files:
- `db.go` — opens the connection, applies WAL mode pragmas, and exposes the `DB` struct (which carries the file path for size calculations).
- `migrations.go` — reads SQL files from the embedded `migrations` package and applies any not yet recorded in `schema_migrations`.

Seven migrations have been applied (see [data-model.md](data-model.md) for schema details).

### 4a. Analysis Engine (`internal/analysis/`)

Rule-based clinical analysis that runs after each import. The engine evaluates a set of `Rule` implementations against stored session signals and writes findings to `session_findings`.

- `engine.go` — `Rule` interface, `Engine` struct, `DefaultEngine()` factory, `Severity` type.
- `baseline.go` — shared utilities: `rollingBaseline`, `percentile`, `findRuns`, `findRunsPred`.
- `rules_pressure.go` — P-01 to P-04 (near-max pressure, pressure ceiling, subtherapeutic, pressure hunting).
- `rules_leak.go` — L-01 to L-05 (large leak, severe leak, session P95, intermittent, sustained leak).
- `rules_resprate.go` — RR-01 to RR-05 (bradypnea, severe bradypnea, tachypnea, severe tachypnea, periodic/CSR pattern).
- `rules_flow.go` — F-01 to F-02 (probable apnea, probable hypopnea from 1 Hz flow signal).
- `rules_flowlim.go` — FL-01 to FL-05 (mild/moderate/severe flow limitation, FL burden, no-pressure-response).

To add a new rule: implement `Rule` in the appropriate `rules_*.go` file and register it in `DefaultEngine()`. No migration or API change is needed.

### 4b. API Layer (`internal/api/`)

Standard library `net/http` with Go 1.22 enhanced route patterns (`GET /path/{id}`). All routes are wired in `router.go`. Handler packages are thin: they parse the request, call a service method, and write JSON. CORS and request logging are composable middleware applied in the router.

Current endpoints: health, devices, imports, sessions (list, get, signals, settings, identification, events, findings), daily summaries, insights, and utilities (stats, delete, vacuum, detect).

### 5. Web UI Layer (`internal/web/`, `web/`)

In production, Vite compiles the React app into `internal/web/dist/`. The Go binary embeds this directory via `//go:embed all:dist` and serves it with an SPA fallback handler. In development, the Go server runs on port 8080 and the Vite dev server runs on port 5173, with `/api/*` proxied to Go.

Key frontend libraries: React 18, React Router v6, TanStack Query (data fetching), Recharts (charts), Tailwind CSS.

## Request Flow

```
Browser → GET /api/v1/sessions/abc/signals
  → CORS middleware
  → Logger middleware
  → SessionsHandler.GetSignals
  → SessionService.GetSignals
  → db.DB (SELECT from session_signals)
  → models.SessionSignals → JSON → 200 OK
```

## Import Flow

```
User selects source path (manual or auto-detected SD card)
  → POST /api/v1/imports
  → ImportService.Create  (row in DB, status=pending)
  → [goroutine]: ImportService.runImport
      → machine.Detector.Detect(path)          → DeviceFamilyResMed
      → ResMedImporter.Run(ctx, source)
          → ParseDeviceTimezone(path)           → *time.Location
          → ParseDeviceSettings(path)           → raw JSON bytes
          → ParseIdentificationRaw(path)        → raw JSON bytes
          → ParseIdentification(path)           → DeviceInfo
          → ParseSTR(path, loc)                 → []STRRecord
          → DiscoverSessions(path, loc)         → []SessionBundle
          → for each bundle:
              extractSignals(pld, brp)          → *SessionSignals
              ParseEVEEvents(eve, deviceID)     → []models.Event
          → return Result
      → upsertDevice
      → for each SessionRecord:
          insertSession
          storeSignals        (session_signals table)
          storeSettings       (settings_snapshots table)
          storeIdentification (device_identification_snapshots table)
          storeEvents         (events table)
          upsertSummary       (daily_summaries table)
      → AnalysisService.RunAndStore(sessionID) → session_findings table
      → UPDATE imports SET status='complete'
```

## Future Extensibility

- **New device families**: add `internal/machine/<family>/` and implement `Detector` recognition + `Importer`.
- **SpO₂ / pulse**: SA2 EDF files are already discovered by `DiscoverSessions`; add signal extraction for SpO₂/PR channels and store them in `session_signals`.
- **New analysis rules**: implement `Rule` in `internal/analysis/rules_*.go` and register in `DefaultEngine()`. No schema change needed.
- **Re-analyze**: expose a `POST /api/v1/sessions/{id}/analyze` endpoint to re-run the analysis engine on sessions imported before the engine existed.
- **Multi-user**: add a `users` table and auth middleware; all existing routes gain a user-scoped filter.
- **Hosted deployment**: replace `modernc.org/sqlite` with a Postgres driver and update repository queries.
