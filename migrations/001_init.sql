-- Initial schema for SomnaTrace.

CREATE TABLE IF NOT EXISTS devices (
    id            TEXT PRIMARY KEY,
    family        TEXT NOT NULL DEFAULT 'unknown',
    manufacturer  TEXT NOT NULL DEFAULT '',
    model         TEXT NOT NULL DEFAULT '',
    serial_number TEXT NOT NULL DEFAULT '',
    first_seen    DATETIME NOT NULL,
    last_seen     DATETIME NOT NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imports (
    id             TEXT PRIMARY KEY,
    device_id      TEXT NOT NULL DEFAULT '',
    source_path    TEXT NOT NULL DEFAULT '',
    source_name    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending',  -- pending | running | complete | failed
    session_count  INTEGER NOT NULL DEFAULT 0,
    error_message  TEXT,
    parser_version TEXT NOT NULL DEFAULT '',
    started_at     DATETIME NOT NULL,
    completed_at   DATETIME,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET DEFAULT
);

CREATE TABLE IF NOT EXISTS sessions (
    id                TEXT PRIMARY KEY,
    device_id         TEXT NOT NULL,
    import_id         TEXT NOT NULL,
    start_time        DATETIME NOT NULL,
    end_time          DATETIME NOT NULL,
    duration_minutes  REAL NOT NULL DEFAULT 0,
    ahi               REAL NOT NULL DEFAULT 0,
    leak_rate_median  REAL NOT NULL DEFAULT 0,
    pressure_p50      REAL NOT NULL DEFAULT 0,
    pressure_p95      REAL NOT NULL DEFAULT 0,
    pressure_max      REAL NOT NULL DEFAULT 0,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (import_id) REFERENCES imports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL,
    device_id     TEXT NOT NULL,
    type          TEXT NOT NULL,  -- obstructive_apnea | central_apnea | hypopnea | spo2_desaturation | large_leak
    start_time    DATETIME NOT NULL,
    duration_sec  REAL NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id)  REFERENCES devices(id)  ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_summaries (
    id              TEXT PRIMARY KEY,
    device_id       TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    date            TEXT NOT NULL,  -- YYYY-MM-DD
    usage_minutes   REAL NOT NULL DEFAULT 0,
    ahi             REAL NOT NULL DEFAULT 0,
    ai_index        REAL NOT NULL DEFAULT 0,
    hi_index        REAL NOT NULL DEFAULT 0,
    leak_rate_median REAL NOT NULL DEFAULT 0,
    leak_rate_p95   REAL NOT NULL DEFAULT 0,
    pressure_p50    REAL NOT NULL DEFAULT 0,
    pressure_p95    REAL NOT NULL DEFAULT 0,
    pressure_max    REAL NOT NULL DEFAULT 0,
    parser_version  TEXT NOT NULL DEFAULT '',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (device_id, date),
    FOREIGN KEY (device_id)  REFERENCES devices(id)  ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings_snapshots (
    id          TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL,
    session_id  TEXT NOT NULL,
    captured_at DATETIME NOT NULL,
    payload     TEXT NOT NULL DEFAULT '{}',  -- JSON blob
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id)  REFERENCES devices(id)  ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_device_start ON sessions(device_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, start_time);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(device_id, date DESC);
