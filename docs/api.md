# API Reference

Base path: `/api/v1`

All responses are JSON. Error responses have the shape `{ "error": "message" }`.

---

## Health

### `GET /api/v1/health`

Returns application status.

**Response**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "mode": "development",
  "uptime": "1m23s",
  "go_version": "go1.22.0",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## Devices

### `GET /api/v1/devices`

List all known devices.

**Response**
```json
{
  "devices": [
    {
      "id": "dev-23254995016",
      "family": "resmed",
      "manufacturer": "ResMed",
      "model": "AirSense 11 AutoSet",
      "serial_number": "23254995016",
      "first_seen": "2026-06-13T00:10:10Z",
      "last_seen": "2026-06-13T00:10:10Z",
      "created_at": "2026-06-13T00:10:10Z"
    }
  ]
}
```

---

## Imports

### `GET /api/v1/imports`

List all import operations, newest first.

**Response**
```json
{
  "imports": [
    {
      "id": "ab94c2674d3321e3",
      "device_id": "dev-23254995016",
      "source_path": "/Volumes/RESMED",
      "source_name": "AirSense 11",
      "status": "complete",
      "session_count": 1,
      "parser_version": "0.1.0",
      "started_at": "2026-06-13T02:22:14Z",
      "completed_at": "2026-06-13T02:22:14Z",
      "created_at": "2026-06-13T02:22:14Z"
    }
  ]
}
```

`status` values: `pending` | `running` | `pending_review` | `complete` | `failed`

### `POST /api/v1/imports`

Start a new import. The import runs asynchronously; poll `GET /api/v1/imports` to observe status.

**Request**
```json
{
  "source_path": "/Volumes/RESMED",
  "source_name": "AirSense 11"
}
```

`source_name` is optional. `source_path` must be an absolute path to a mounted SD card or mirror directory.

**Response** — `200 OK`
```json
{
  "id": "ab94c2674d3321e3",
  "status": "pending",
  ...
}
```

### `GET /api/v1/imports/{id}/candidates`

List session candidates discovered during an import in `pending_review` status.

**Response** — `200 OK`
```json
{
  "sessions": [
    {
      "id": "c4949c05a5ab5264",
      "start_time": "2026-06-13T00:10:10Z",
      "end_time": "2026-06-13T07:15:00Z",
      "duration_minutes": 424.8,
      "ahi": 2.1,
      "event_count": 15,
      "leak_rate": 0.0,
      "pressure_p50": 5.6,
      "already_imported": false
    }
  ]
}
```

### `POST /api/v1/imports/{id}/confirm`

Confirm which session candidates to import. Transitions the import from `pending_review` to running.

**Request**
```json
{
  "session_ids": ["c4949c05a5ab5264"]
}
```

**Response** — `200 OK`
```json
{ "status": "ok" }
```

---

## Sessions

### `GET /api/v1/sessions`

List all sessions, newest first. Supports optional filtering.

**Query params**
| Param | Type | Description |
|---|---|---|
| `event_type` | string | Filter to sessions containing this event type |
| `since` | string | ISO 8601 datetime — return sessions starting on or after this time |

**Response**
```json
{
  "sessions": [
    {
      "id": "c4949c05a5ab5264",
      "device_id": "dev-23254995016",
      "import_id": "ab94c2674d3321e3",
      "start_time": "2026-06-13T00:10:10Z",
      "end_time": "2026-06-13T07:15:00Z",
      "duration_minutes": 424.8,
      "ahi": 2.1,
      "leak_rate_median": 0.0,
      "pressure_p50": 5.6,
      "pressure_p95": 6.8,
      "pressure_max": 7.0,
      "event_count": 15,
      "created_at": "2026-06-13T02:22:14Z"
    }
  ]
}
```

### `GET /api/v1/sessions/{id}`

Get a single session by ID.

**Response** — `200 OK` or `404 Not Found`

### `GET /api/v1/sessions/{id}/signals`

Get stored EDF signal time-series for a session.

**Response** — `200 OK` or `404 Not Found`
```json
{
  "session_id": "c4949c05a5ab5264",
  "pressure":  [{ "t": 0.0, "v": 5.6 }, ...],
  "leak":      [{ "t": 0.0, "v": 0.0 }, ...],
  "resp_rate": [{ "t": 0.0, "v": 15.2 }, ...],
  "flow_lim":  [{ "t": 0.0, "v": 0.01 }, ...],
  "flow":      [{ "t": 0.0, "v": 0.243 }, ...]
}
```

- `t` — seconds from session start
- `pressure`, `leak`, `resp_rate`, `flow_lim` — 2-second intervals (from PLD EDF)
- `flow` — 1-second intervals (Flow.40ms at 25 Hz, downsampled ×25)
- Units: pressure in cmH₂O, leak in L/min, resp_rate in br/min, flow in L/s

### `GET /api/v1/sessions/{id}/settings`

Get the raw `CurrentSettings.json` payload captured at import time, returned as a parsed JSON object.

**Response** — `200 OK` or `404 Not Found`

The response mirrors the nested structure of ResMed's `CurrentSettings.json`:
```json
{
  "FlowGenerator": {
    "SettingProfiles": {
      "FeatureProfiles": {
        "ClimateFeature": { "HeatedTubeTemperature": 27.0, ... },
        "TemperatureFeature": { "TemperatureUnit": "Fahrenheit" },
        "TimeZoneFeature": { "TimeZoneOffset": "-08:00" },
        ...
      }
    }
  }
}
```

### `GET /api/v1/sessions/{id}/identification`

Get the raw `Identification.json` payload captured at import time.

**Response** — `200 OK` or `404 Not Found`

```json
{
  "FlowGenerator": {
    "IdentificationProfiles": {
      "Product": {
        "ProductName": "AirSense 11 AutoSet",
        "ProductCode": "39523",
        "SerialNumber": "23254995016",
        "ProductGeographicIdentifier": "USA"
      },
      "Hardware": {
        "HardwareIdentifier": "(90)R390-7703(91)AV004(21)2259N97108"
      },
      "Software": {
        "ApplicationIdentifier": "SW04600.16.8.5.0.9cd562102",
        "ConfigurationIdentifier": "CF04600.16.03.00.9cd562102",
        "BootloaderIdentifier": "SW04601.00.1.1.0.736edbdfd",
        "DataModelVersionIdentifier": "v2.15.3.53c1a73b8"
      }
    }
  }
}
```

### `GET /api/v1/sessions/{id}/events`

Get the scored respiratory events for a session.

**Response** — `200 OK` or `404 Not Found`
```json
{
  "events": [
    {
      "id": "...",
      "session_id": "c4949c05a5ab5264",
      "device_id": "dev-23254995016",
      "type": "obstructive_apnea",
      "start_time": "2026-06-13T00:15:30Z",
      "duration_seconds": 12.5,
      "created_at": "2026-06-13T02:22:14Z"
    }
  ]
}
```

`type` values: `obstructive_apnea` | `central_apnea` | `hypopnea` | `spo2_desaturation` | `large_leak`

Returns an empty `events` array when no events were recorded.

### `GET /api/v1/sessions/{id}/findings`

Get clinical analysis findings for a session.

**Response** — `200 OK` or `404 Not Found`
```json
{
  "findings": [
    {
      "id": "...",
      "session_id": "c4949c05a5ab5264",
      "rule_id": "L-01",
      "title": "Large Leak Detected",
      "detail": "Leak exceeded 24 L/min for 3 minutes starting at 01:12:00.",
      "severity": "alert",
      "start_sec": 4320.0,
      "end_sec": 4500.0
    }
  ],
  "analyzed_at": "2026-06-13T02:22:15Z"
}
```

`severity` values: `info` | `warning` | `alert` | `critical`

`start_sec` and `end_sec` are seconds from session start and may be `null` for session-level findings.

### `POST /api/v1/sessions/{id}/analyze`

Re-run the clinical analysis engine on a session. Clears existing findings and replaces them with the current output of all enabled rules. Useful for sessions imported before a rule was added or after threshold changes.

**Response** — `200 OK`
```json
{ "status": "ok" }
```

---

## Daily Summaries

### `GET /api/v1/summaries/daily`

List daily summaries, newest first.

**Query params**
| Param | Type | Default | Description |
|---|---|---|---|
| `limit` | int | 30 | Max rows to return (1–365) |

**Response**
```json
{
  "summaries": [
    {
      "id": "...",
      "device_id": "dev-23254995016",
      "session_id": "c4949c05a5ab5264",
      "date": "2026-06-12",
      "usage_minutes": 424.8,
      "ahi": 2.1,
      "ai_index": 1.2,
      "hi_index": 0.9,
      "leak_rate_median": 0.0,
      "leak_rate_p95": 0.0,
      "pressure_p50": 5.6,
      "pressure_p95": 6.8,
      "pressure_max": 7.0,
      "parser_version": "0.1.0",
      "created_at": "2026-06-13T02:22:14Z"
    }
  ]
}
```

---

## Insights

### `GET /api/v1/insights`

Returns aggregated trend data for the Insights dashboard.

**Query params**
| Param | Type | Default | Description |
|---|---|---|---|
| `days` | int | 30 | Lookback window in days (1–365) |

**Response**
```json
{
  "period_days": 30,
  "summaries": [ /* DailySummary objects, ASC by date */ ],
  "event_counts": {
    "obstructive_apnea": 12,
    "hypopnea": 5,
    "central_apnea": 0
  },
  "current_streak": 7,
  "longest_streak": 14
}
```

- `summaries` — ordered oldest-first for chronological charting; same shape as the daily summaries list endpoint.
- `event_counts` — map of `EventType → count` for the selected period; omits types with zero events.
- `current_streak` and `longest_streak` — consecutive nights with ≥ compliance threshold hours of usage, computed from all-time data.

---

## Analysis Rules

### `GET /api/v1/rules`

List all analysis rules and their enabled state.

**Response**
```json
{
  "rules": [
    {
      "id": "L-01",
      "title": "Large Leak",
      "description": "Leak rate exceeded the large-leak threshold for a sustained period.",
      "category": "Leak",
      "severity": "alert",
      "enabled": true
    }
  ]
}
```

### `PATCH /api/v1/rules/{id}`

Enable or disable a specific rule. Takes effect on the next import or re-analyze.

**Request**
```json
{ "enabled": false }
```

**Response** — `200 OK`
```json
{ "enabled": false }
```

---

## App Settings

### `GET /api/v1/settings`

Return all user-configurable application settings.

**Response**
```json
{
  "compliance_hours_threshold": 4.0,
  "compliance_pct_threshold": 70.0,
  "leak_warn_p95": 24.0,
  "leak_alert_p95": 40.0,
  "first_session_date": "2026-05-14"
}
```

`first_session_date` is `null` when no sessions have been imported yet. All other fields always have values (seeded from defaults in migration 009).

### `PATCH /api/v1/settings`

Update one or more configurable thresholds. Only include the fields you want to change.

**Request**
```json
{
  "compliance_hours_threshold": 4.0,
  "compliance_pct_threshold": 70.0,
  "leak_warn_p95": 24.0,
  "leak_alert_p95": 40.0
}
```

**Response** — `200 OK` — full settings object (same shape as `GET /api/v1/settings`)

---

## Utilities

### `GET /api/v1/stats`

Database row counts and file size.

**Response**
```json
{
  "counts": {
    "devices": 1,
    "imports": 3,
    "sessions": 30,
    "daily_summaries": 30,
    "events": 412,
    "session_signals": 30
  },
  "size_bytes": 204800
}
```

### `DELETE /api/v1/data`

Delete all user data (devices, imports, sessions, signals, settings, identification snapshots, findings). Schema is preserved.

**Response** — `200 OK`
```json
{ "status": "ok" }
```

### `POST /api/v1/maintenance/vacuum`

Checkpoint the WAL and run `VACUUM` to reclaim disk space.

**Response** — `200 OK`
```json
{ "status": "ok" }
```

### `GET /api/v1/detect`

Scan mounted volumes for ResMed SD cards (checks for `Identification.json`).

**Response**
```json
{
  "cards": [
    { "path": "/Volumes/RESMED" }
  ]
}
```

Returns an empty `cards` array if nothing is detected.

---

## Backups

Backups are stored as clean SQLite snapshots in `~/.somnatrace/backups/`. Each backup ID encodes its creation timestamp (`YYYYMMDD-HHMMSS`).

### `GET /api/v1/backups`

List all available backup snapshots, newest first.

**Response**
```json
{
  "backups": [
    {
      "id": "20260614-153045",
      "created_at": "2026-06-14T15:30:45Z",
      "size_bytes": 4194304
    }
  ]
}
```

### `POST /api/v1/backups`

Create a new backup snapshot. Checkpoints the WAL and writes a clean copy of the database using `VACUUM INTO`.

**Response** — `201 Created`
```json
{
  "id": "20260614-153045",
  "created_at": "2026-06-14T15:30:45Z",
  "size_bytes": 4194304
}
```

### `POST /api/v1/backups/{id}/restore`

Restore from a named backup. Replaces all data in the running database with the contents of the backup using SQL `ATTACH` — no server restart is required. All current data is overwritten.

**Response** — `200 OK`
```json
{ "status": "ok" }
```

Returns `400 Bad Request` if the backup ID is invalid or the file does not exist.

### `DELETE /api/v1/backups/{id}`

Permanently remove a backup snapshot file from disk.

**Response** — `200 OK`
```json
{ "status": "ok" }
```
