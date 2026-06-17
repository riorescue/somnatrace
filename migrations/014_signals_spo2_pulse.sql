-- Add SpO2 and pulse rate signal columns to session_signals.
-- Each column stores a JSON array of {t, v} objects matching the existing format.
-- NULL means no pulse oximeter was attached during the session.

ALTER TABLE session_signals ADD COLUMN spo2  TEXT;
ALTER TABLE session_signals ADD COLUMN pulse TEXT;
