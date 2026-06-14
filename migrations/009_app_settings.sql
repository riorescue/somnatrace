CREATE TABLE app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default compliance thresholds so GET /api/v1/settings always returns values
-- without needing special-case logic for a missing table row.
INSERT INTO app_settings (key, value) VALUES
    ('compliance_hours_threshold', '4.0'),
    ('compliance_pct_threshold',   '70.0');
