-- Configurable leak rate thresholds.
-- Defaults are ResMed AirSense clinical reference values (unintentional leak, L/min).
-- Other manufacturers measure total mask leak and use different scales.
INSERT OR IGNORE INTO app_settings (key, value) VALUES
    ('leak_warn_p95',  '24.0'),
    ('leak_alert_p95', '40.0');
