-- Enforce one settings snapshot per session so re-imports upsert cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_snapshots_session
    ON settings_snapshots(session_id);
