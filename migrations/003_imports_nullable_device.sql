-- Allow imports to be created before the device is identified.
-- SQLite FK checks do not apply to NULL values, so making device_id nullable
-- lets us INSERT a pending import and set the device after parsing.

PRAGMA foreign_keys=OFF;

CREATE TABLE imports_v2 (
    id             TEXT PRIMARY KEY,
    device_id      TEXT,                -- NULL until device is identified
    source_path    TEXT NOT NULL DEFAULT '',
    source_name    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending',
    session_count  INTEGER NOT NULL DEFAULT 0,
    error_message  TEXT,
    parser_version TEXT NOT NULL DEFAULT '',
    started_at     DATETIME NOT NULL,
    completed_at   DATETIME,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
);

INSERT INTO imports_v2 SELECT * FROM imports;

DROP TABLE imports;
ALTER TABLE imports_v2 RENAME TO imports;

PRAGMA foreign_keys=ON;
