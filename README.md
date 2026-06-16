# SomnaTrace

**Local-first sleep therapy data viewer.** Import your SD card exports, explore nightly sessions, and track therapy trends — entirely on your own machine. No account, no cloud, no telemetry.

> **Status: v0.2.0 — Functional with real CPAP therapy data.** Full EDF parsing, signal visualization, event timeline, clinical analysis engine, multi-night insights, reports, configurable thresholds, and machine settings capture are all working.

---

## Why SomnaTrace?

Modern CPAP devices record detailed therapy data to SD cards — nightly AHI, pressure logs, flow waveforms, and event markers. Most users either rely on the device manufacturer's proprietary cloud service, or work with brittle third-party tools that haven't kept pace with newer devices.

SomnaTrace is an open-source alternative: insert your SD card, point the app at the mounted volume, and get a clean local dashboard with no account required.

---

## What Works Today

- **Real EDF parsing** — full binary header + signal + data record decoding, including EDF+D annotation tracks
- **CPAP/BiPAP device support** — automatic SD card detection, session discovery, timezone-aware timestamp parsing (ResMed AirSense/AirCurve 10 & 11 currently supported; additional brands planned)
- **Signal visualization** — pressure, flow waveform, respiratory rate, and leak rate charts with timeline slider and expand mode
- **Clinical reference lines** — per-chart upper/lower bounds reflecting accepted clinical ranges (e.g. Large Leak at 24 L/min, normal resp rate 12–20 br/min)
- **Synchronized hover** — hovering on any chart cross-highlights the same timestamp on all others
- **Event timeline** — scored respiratory events (obstructive/central apneas, hypopneas, large leaks, SpO₂ desaturations) parsed from EDF+ annotation files and displayed with timeline strip and event list
- **Clinical analysis engine** — 20+ rule-based findings (pressure hunting, large leaks, respiratory rate anomalies, flow limitation burden, probable apneas/hypopneas) run automatically at import and displayed per-session with severity classification (Info/Warning/Alert/Critical)
- **Rules configuration** — enable or disable individual analysis rules from the Rules page
- **Multi-night insights** — AHI trend, nightly usage, pressure profile, event breakdown, night-quality calendar, therapy streaks; configurable 7-day to 1-year window
- **Reports** — Compliance, Device, and Effectiveness reports with print-friendly layouts
- **Machine settings capture** — device settings stored per-session at import time, displayed on session detail
- **Device identification capture** — product info, software versions, and hardware ID stored per-session
- **Re-analyze** — re-run the clinical analysis engine on any session from the session detail page
- **Configurable thresholds** — compliance hours/percentage and leak rate warning/alert levels are user-adjustable from the Settings page
- **Backup & Restore** — one-click database backup with multiple named snapshots; one-click restore from any saved backup (no server restart required)
- **Utilities** — database stats, vacuum, CSV export, SD card detection, delete all data

---

## Quick Start (native)

**Prerequisites:** Go 1.25+, Node 20+

```bash
git clone https://github.com/riorescue/somnatrace.git
cd somnatrace

# Install frontend dependencies
cd web && npm install && cd ..

# Run in development mode (Go API on 8080 + Vite dev server on 5173)
./scripts/dev.sh
```

Open [http://localhost:5173](http://localhost:5173). Demo data loads automatically; import real data from the Imports page.

---

## Quick Start (Docker)

```bash
git clone https://github.com/riorescue/somnatrace.git
cd somnatrace
docker compose up
```

Open [http://localhost:8080](http://localhost:8080).

---

## Build Commands

| Command | Description |
|---|---|
| `make dev` | Start API + UI in parallel |
| `make api` | Start Go API only (port 8080) |
| `make ui` | Start Vite dev server only (port 5173) |
| `make build` | Build frontend + Go binary |
| `make build-go` | Build Go binary only |
| `make build-ui` | Build frontend into `internal/web/dist/` |
| `make seed` | Seed 30 days of synthetic data |
| `make seed DAYS=N` | Seed N days of synthetic data |
| `make test` | Run Go tests |
| `make lint` | Run Go vet + TypeScript type-check |
| `make clean` | Remove build artefacts |

---

## Configuration

All settings are read from environment variables with sensible defaults.

| Variable | Default | Description |
|---|---|---|
| `SOMNATRACE_HOST` | `127.0.0.1` | Listen host |
| `SOMNATRACE_PORT` | `8080` | Listen port |
| `SOMNATRACE_DATA_DIR` | `~/.somnatrace` | Where the database and backups live |
| `SOMNATRACE_DB_PATH` | `$DATA_DIR/somnatrace.db` | Full database path |
| `SOMNATRACE_MODE` | `production` | `development` or `production` |

---

## Repository Layout

```
cmd/somnatrace/     Entry point
cmd/seed/           Synthetic data seeder
cmd/probe/          EDF diagnostic tool
internal/
  api/              HTTP router, handlers, middleware
  app/              Application wiring
  config/           Environment-based configuration
  db/               SQLite connection and migrations
  edf/              EDF binary format reader
  importer/         Import pipeline (device-agnostic interface + per-brand implementations)
  machine/          Device detection and per-brand parsers
    resmed/         ResMed decoder, settings, identification
  models/           Shared data models
  service/          Business logic layer
  web/              Embedded frontend assets
migrations/         SQL migration files (010 migrations applied)
web/                Vite + React + TypeScript frontend
docs/               Architecture and developer guides
```

---

## Planned

- SpO₂ & pulse rate visualization (SA2 EDF files are already discovered; signal extraction not yet implemented)
- Philips DreamStation support
- OSCAR-compatible data import

---

## Contributing

Contributions are welcome. See [docs/development.md](docs/development.md) for the local setup guide and [docs/architecture.md](docs/architecture.md) for system design context.

---

## License

MIT — see [LICENSE](LICENSE).
