# Data Model

All tables live in a single SQLite database file (default: `~/.somnatrace/somnatrace.db`). Foreign keys are enforced and WAL mode is active. Seven migrations have been applied.

## Tables

### `devices`

One row per physical therapy device, identified by serial number.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `dev-<serial>` |
| `family` | TEXT | `resmed` \| `unknown` |
| `manufacturer` | TEXT | e.g. `ResMed` |
| `model` | TEXT | e.g. `AirSense 11 AutoSet` |
| `serial_number` | TEXT | From `Identification.json` |
| `first_seen` | DATETIME | Earliest known session |
| `last_seen` | DATETIME | Most recent session |
| `created_at` | DATETIME | |

### `imports`

One row per import operation. Tracks source path, parser version, and outcome.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Random hex |
| `device_id` | TEXT FK nullable | Resolved during import; NULL until device is identified |
| `source_path` | TEXT | Absolute path to SD card or mirror directory |
| `source_name` | TEXT | Human-readable label |
| `status` | TEXT | `pending` \| `running` \| `complete` \| `failed` |
| `session_count` | INTEGER | Sessions discovered |
| `error_message` | TEXT | Set on failure |
| `parser_version` | TEXT | Semver of the parser used |
| `started_at` | DATETIME | |
| `completed_at` | DATETIME | NULL until finished |
| `created_at` | DATETIME | |

### `sessions`

One row per continuous therapy session. Holds summary statistics derived from STR.edf or PLD EDF fallback.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Random hex |
| `device_id` | TEXT FK | |
| `import_id` | TEXT FK | |
| `start_time` | DATETIME | UTC; converted from device local time via `TimeZoneOffset` |
| `end_time` | DATETIME | UTC |
| `duration_minutes` | REAL | |
| `ahi` | REAL | Apnea-Hypopnea Index (events/hour) |
| `leak_rate_median` | REAL | L/min |
| `pressure_p50` | REAL | cmH₂O |
| `pressure_p95` | REAL | cmH₂O |
| `pressure_max` | REAL | cmH₂O |
| `created_at` | DATETIME | |

### `session_signals`

High-frequency EDF signal data, stored as JSON arrays of `{t, v}` points. One row per session; upserted on re-import.

| Column | Type | Notes |
|---|---|---|
| `session_id` | TEXT PK FK | References `sessions(id)` ON DELETE CASCADE |
| `pressure` | TEXT | JSON — MaskPress.2s in cmH₂O, 2 s intervals |
| `leak` | TEXT | JSON — Leak.2s converted to L/min, 2 s intervals |
| `resp_rate` | TEXT | JSON — RespRate.2s in br/min, 2 s intervals |
| `flow_lim` | TEXT | JSON — FlowLim.2s (0–1 dimensionless), 2 s intervals |
| `flow` | TEXT | JSON — Flow.40ms downsampled to 1 Hz in L/s |
| `created_at` | DATETIME | |

Each JSON array element: `{ "t": <seconds_from_start>, "v": <value> }`.

### `events`

One row per scored respiratory event, parsed from EDF+ annotation (EVE) files at import time.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `session_id` | TEXT FK | |
| `device_id` | TEXT FK | |
| `type` | TEXT | `obstructive_apnea` \| `central_apnea` \| `hypopnea` \| `spo2_desaturation` \| `large_leak` |
| `start_time` | DATETIME | UTC absolute timestamp |
| `duration_sec` | REAL | Event duration in seconds |
| `created_at` | DATETIME | |

### `daily_summaries`

Denormalized per-night aggregate. Unique on `(device_id, date)`; upserted on re-import.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `device_id` | TEXT FK | |
| `session_id` | TEXT FK | |
| `date` | TEXT | `YYYY-MM-DD` in device-local timezone |
| `usage_minutes` | REAL | |
| `ahi` | REAL | |
| `ai_index` | REAL | Apnea index |
| `hi_index` | REAL | Hypopnea index |
| `leak_rate_median` | REAL | L/min |
| `leak_rate_p95` | REAL | L/min |
| `pressure_p50` | REAL | cmH₂O |
| `pressure_p95` | REAL | cmH₂O |
| `pressure_max` | REAL | cmH₂O |
| `parser_version` | TEXT | Allows re-score detection |
| `created_at` | DATETIME | |

### `session_findings`

One row per clinical finding produced by the analysis engine. Populated at import time via `AnalysisService.RunAndStore`. Upserted on re-import.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `session_id` | TEXT FK | References `sessions(id)` ON DELETE CASCADE |
| `rule_id` | TEXT | Rule identifier (e.g. `L-01`, `P-03`, `RR-02`) |
| `title` | TEXT | Short finding title |
| `detail` | TEXT | Human-readable description with supporting data |
| `severity` | TEXT | `info` \| `warning` \| `alert` \| `critical` |
| `start_sec` | REAL nullable | Seconds from session start; NULL for session-level findings |
| `end_sec` | REAL nullable | Seconds from session start; NULL for session-level findings |
| `created_at` | DATETIME | |

### `settings_snapshots`

Raw `CurrentSettings.json` captured from the SD card at import time. Unique per session; upserted on re-import.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `device_id` | TEXT FK | |
| `session_id` | TEXT UNIQUE FK | References `sessions(id)` ON DELETE CASCADE |
| `captured_at` | DATETIME | Session start time |
| `payload` | TEXT | Full JSON blob from `SETTINGS/CurrentSettings.json` |
| `created_at` | DATETIME | |

Settings can change between sessions. Capturing a snapshot per session preserves the exact configuration that was active for each night.

### `device_identification_snapshots`

Raw `Identification.json` captured from the SD card at import time. Unique per session; upserted on re-import.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `device_id` | TEXT FK | References `devices(id)` ON DELETE CASCADE |
| `session_id` | TEXT UNIQUE FK | References `sessions(id)` ON DELETE CASCADE |
| `captured_at` | DATETIME | Session start time |
| `payload` | TEXT | Full JSON blob from `Identification.json` |
| `created_at` | DATETIME | |

Stores product info, hardware identifiers, and firmware/software versions as they were at import time.

### `schema_migrations`

Internal migration tracking. Do not modify directly.

## Relationships

```
devices ──< imports ──< sessions ──< events
                    │         └──< daily_summaries
                    │         └──< session_signals
                    │         └──< session_findings
                    │         └──< settings_snapshots
                    │         └──< device_identification_snapshots
                    └── device_id on sessions
```

## Migration History

| # | File | Description |
|---|---|---|
| 001 | `001_init.sql` | Core schema: devices, imports, sessions, events, daily_summaries, settings_snapshots |
| 002 | `002_seed.sql` | Demo data |
| 003 | `003_imports_nullable_device.sql` | Make `imports.device_id` nullable (supports pending imports before device is identified) |
| 004 | `004_session_signals.sql` | Add `session_signals` table for EDF time-series storage |
| 005 | `005_settings_snapshot_unique.sql` | Add unique index on `settings_snapshots(session_id)` for upsert support |
| 006 | `006_device_identification_snapshots.sql` | Add `device_identification_snapshots` table |
| 007 | `007_session_findings.sql` | Add `session_findings` table for clinical analysis engine output |
