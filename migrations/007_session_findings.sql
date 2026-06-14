CREATE TABLE IF NOT EXISTS session_findings (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    rule_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    detail      TEXT NOT NULL,
    severity    TEXT NOT NULL CHECK(severity IN ('info','warning','alert','critical')),
    start_sec   REAL,
    end_sec     REAL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_session_findings_session
    ON session_findings(session_id);
