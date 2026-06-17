# Data Model

All tables live in a single SQLite database file (default: `~/.somnatrace/somnatrace.db`). Foreign keys are enforced and WAL mode is active. Fourteen migrations have been applied.

## Tables

### `devices`

One row per physical therapy device, identified by serial number.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | SHA-256 derived UUID from brand + serial |
| `family` | TEXT | `resmed` \| `dreamstation` \| `sleepstyle` \| `unknown` |
| `manufacturer` | TEXT | e.g. `ResMed`, `Philips Respironics`, `Fisher & Paykel` |
| `model` | TEXT | e.g. `AirSense 11 AutoSet`, `DreamStation Auto CPAP` |
| `serial_number` | TEXT | From device properties file |
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
| `status` | TEXT | `pending` \| `running` \| `pending_review` \| `complete` \| `failed` |
| `session_count` | INTEGER | Sessions discovered |
| `error_message` | TEXT | Set on failure |
| `parser_version` | TEXT | Semver of the parser used |
| `started_at` | DATETIME | |
| `completed_at` | DATETIME | NULL until finished |
| `created_at` | DATETIME | |

### `sessions`

One row per continuous therapy session.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Random hex |
| `device_id` | TEXT FK | |
| `import_id` | TEXT FK | |
| `start_time` | DATETIME | UTC |
| `end_time` | DATETIME | UTC |
| `duration_minutes` | REAL | |
| `ahi` | REAL | Apnea-Hypopnea Index (events/hour); 0 when device doesn't score AHI |
| `leak_rate_median` | REAL | L/min |
| `pressure_p50` | REAL | cmH₂O |
| `pressure_p95` | REAL | cmH₂O |
| `pressure_max` | REAL | cmH₂O |
| `mask_id` | TEXT FK nullable | References `masks(id)` |
| `notes` | TEXT nullable | User-entered session notes |
| `morning_feel` | TEXT nullable | `good` \| `fair` \| `poor` |
| `created_at` | DATETIME | |

### `session_signals`

High-frequency signal data, stored as JSON arrays of `{t, v}` points. One row per session; upserted on re-import.

| Column | Type | Notes |
|---|---|---|
| `session_id` | TEXT PK FK | References `sessions(id)` ON DELETE CASCADE |
| `pressure` | TEXT | JSON — mask pressure in cmH₂O |
| `leak` | TEXT | JSON — leak rate in L/min |
| `resp_rate` | TEXT | JSON — respiratory rate in br/min (ResMed only) |
| `flow_lim` | TEXT | JSON — flow limitation index 0–1 (ResMed only) |
| `flow` | TEXT | JSON — airway flow in L/s (ResMed) or L/min (SleepStyle) |
| `spo2` | TEXT | JSON — SpO₂ % (ResMed SA2 EDF) |
| `pulse` | TEXT | JSON — pulse rate bpm (ResMed SA2 EDF) |

Each JSON array element: `{ "t": <seconds_from_start>, "v": <value> }`.

Signal sources by device:
- **ResMed**: pressure/leak/resp_rate/flow_lim from PLD EDF (2 s intervals); flow from BRP EDF (25 Hz, downsampled to 1 Hz); spo2/pulse from SA2 EDF (1 Hz).
- **DreamStation**: no waveform signals stored (device does not write readable waveform files on DS1/DS2).
- **SleepStyle**: pressure (1 Hz), leak (1 Hz), and leak-corrected flow (25 Hz) from REALTIME/HRD*.EDF.

### `events`

One row per scored respiratory event.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `session_id` | TEXT FK | |
| `device_id` | TEXT FK | |
| `type` | TEXT | See event types below |
| `start_time` | DATETIME | UTC absolute timestamp |
| `duration_sec` | REAL | Event duration in seconds |
| `created_at` | DATETIME | |

Event type values:

| Value | Description | Source |
|---|---|---|
| `obstructive_apnea` | Complete obstruction ≥ 10 s | ResMed EVE, DreamStation .002 |
| `central_apnea` | Absent respiratory effort ≥ 10 s | ResMed EVE, DreamStation .002 |
| `hypopnea` | Partial flow reduction ≥ 10 s | ResMed EVE, DreamStation .002 |
| `rera` | Respiratory effort-related arousal | DreamStation .002 |
| `flow_limitation` | Partial flow restriction without arousal | DreamStation .002 |
| `periodic_breathing` | Cyclic crescendo/decrescendo breathing | DreamStation .002 |
| `large_leak` | Unintentional mask leak above threshold | ResMed EVE, DreamStation .002 |
| `spo2_desaturation` | SpO₂ drop ≥ 3% | ResMed EVE |
| `csr` | Cheyne-Stokes respiration | ResMed EVE |

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

One row per clinical finding produced by the analysis engine. Populated at import time via `AnalysisService.RunAndStore` and on-demand via `POST /api/v1/sessions/{id}/analyze`.

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

Raw `CurrentSettings.json` captured from the SD card at import time (ResMed only). Unique per session; upserted on re-import.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `device_id` | TEXT FK | |
| `session_id` | TEXT UNIQUE FK | References `sessions(id)` ON DELETE CASCADE |
| `captured_at` | DATETIME | Session start time |
| `payload` | TEXT | Full JSON blob from `SETTINGS/CurrentSettings.json` |
| `created_at` | DATETIME | |

### `device_identification_snapshots`

Raw `Identification.json` captured from the SD card at import time (ResMed only). Unique per session; upserted on re-import.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `device_id` | TEXT FK | References `devices(id)` ON DELETE CASCADE |
| `session_id` | TEXT UNIQUE FK | References `sessions(id)` ON DELETE CASCADE |
| `captured_at` | DATETIME | Session start time |
| `payload` | TEXT | Full JSON blob from `Identification.json` |
| `created_at` | DATETIME | |

### `masks`

User-maintained catalog of CPAP masks for session annotation.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT | User-assigned display name |
| `manufacturer` | TEXT | |
| `model` | TEXT | |
| `size` | TEXT | |
| `cushion_type` | TEXT | |
| `created_at` | DATETIME | |

### `rule_settings`

Per-rule enable/disable state. A missing row means the rule is enabled by default.

| Column | Type | Notes |
|---|---|---|
| `rule_id` | TEXT PK | Matches the rule's `ID()` return value (e.g. `L-01`) |
| `enabled` | INTEGER | `1` = enabled, `0` = disabled |
| `updated_at` | TEXT | ISO 8601 timestamp of last change |

### `app_settings`

Key/value store for user-configurable application settings.

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | Setting name |
| `value` | TEXT | String-encoded value |
| `updated_at` | TEXT | ISO 8601 timestamp of last change |

Current keys:

| Key | Default | Description |
|---|---|---|
| `compliance_hours_threshold` | `4.0` | Minimum nightly usage (hours) to count as a compliant night |
| `compliance_pct_threshold` | `70.0` | Target percentage of nights that meet the hours threshold |
| `leak_warn_p95` | `24.0` | P95 leak rate (L/min) that triggers a warning finding |
| `leak_alert_p95` | `40.0` | P95 leak rate (L/min) that triggers an alert finding |

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
masks ──< sessions
```

`rule_settings` and `app_settings` are standalone configuration tables with no foreign key relationships.

## Migration History

| # | File | Description |
|---|---|---|
| 001 | `001_init.sql` | Core schema: devices, imports, sessions, events, daily_summaries, settings_snapshots |
| 002 | `002_seed.sql` | Demo data |
| 003 | `003_imports_nullable_device.sql` | Make `imports.device_id` nullable |
| 004 | `004_session_signals.sql` | Add `session_signals` table for signal time-series storage |
| 005 | `005_settings_snapshot_unique.sql` | Add unique index on `settings_snapshots(session_id)` |
| 006 | `006_device_identification_snapshots.sql` | Add `device_identification_snapshots` table |
| 007 | `007_session_findings.sql` | Add `session_findings` table for analysis engine output |
| 008 | `008_rule_settings.sql` | Add `rule_settings` table for per-rule enable/disable |
| 009 | `009_app_settings.sql` | Add `app_settings` table; seed compliance threshold defaults |
| 010 | `010_leak_settings.sql` | Seed leak rate warning/alert threshold defaults |
| 011 | `011_masks.sql` | Add `masks` table and `sessions.mask_id` FK |
| 012 | `012_morning_feel.sql` | Add `sessions.morning_feel` column |
| 013 | `013_morning_feel_rename.sql` | Rename morning feel column for consistency |
| 014 | `014_signals_spo2_pulse.sql` | Add `spo2` and `pulse` columns to `session_signals` |
