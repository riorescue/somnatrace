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

`status` values: `pending` | `running` | `complete` | `failed`

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

---

## Sessions

### `GET /api/v1/sessions`

List all sessions, newest first.

**Response**
```json
{
  "sessions": [
    {
      "id": "c4949c05a5ab5264",
      "device_id": "dev-23254995016",
      "import_id": "ab94c2674d3321e3",
      "start_time": "2026-06-13T00:10:10Z",
      "end_time": "2026-06-13T00:19:22Z",
      "duration_minutes": 9.2,
      "ahi": 0.0,
      "leak_rate_median": 0.0,
      "pressure_p50": 5.6,
      "pressure_p95": 6.8,
      "pressure_max": 7.0,
      "event_count": 3,
      "created_at": "2026-06-13T02:22:14Z"
    }
  ]
}
```

### `GET /api/v1/sessions/{id}`

Get a single session by ID.

**Response** — `200 OK` or `404 Not Found`

### `GET /api/v1/sessions/{id}/signals`

Get stored EDF signal time-series for a session. Signals are sampled at the rates noted below.

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

Get the raw `Identification.json` payload captured at import time, returned as a parsed JSON object.

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

Get the scored respiratory events for a session, parsed from EDF+ annotation (EVE) files at import time.

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

Returns an empty `events` array when no events were recorded for the session.

### `GET /api/v1/sessions/{id}/findings`

Get clinical analysis findings for a session. Findings are computed by the analysis engine at import time and stored in `session_findings`.

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
  ]
}
```

`severity` values: `info` | `warning` | `alert` | `critical`

`start_sec` and `end_sec` are seconds from session start and may be `null` for session-level findings.

Returns an empty `findings` array when the analysis engine produced no findings.

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
      "usage_minutes": 9.2,
      "ahi": 0.0,
      "ai_index": 0.0,
      "hi_index": 0.0,
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
- `current_streak` and `longest_streak` — consecutive nights with ≥ 4 hours usage, computed from all-time data.

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
    "sessions": 8,
    "daily_summaries": 8,
    "events": 0,
    "session_signals": 1
  },
  "size_bytes": 204800
}
```

### `DELETE /api/v1/data`

Delete all user data (devices, imports, sessions, signals, settings, identification snapshots). Schema is preserved.

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
