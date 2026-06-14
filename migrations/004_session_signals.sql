-- Stores per-session EDF signal data captured at import time.
-- Each column is a JSON array of {t, v} objects (t=seconds from start, v=physical value).
-- Data is written once at import and read on-demand for charting.

CREATE TABLE IF NOT EXISTS session_signals (
    session_id  TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    pressure    TEXT,   -- MaskPress.2s in cmH2O
    leak        TEXT,   -- Leak.2s converted to L/min
    resp_rate   TEXT,   -- RespRate.2s in breaths/min
    flow_lim    TEXT,   -- FlowLim.2s in 0-1
    flow        TEXT,   -- Flow.40ms downsampled to 1 Hz in L/s
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
