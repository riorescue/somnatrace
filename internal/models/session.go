package models

import "time"

// Session represents a single continuous therapy session — one mask-on to mask-off
// period. Summary statistics are derived from STR.edf (preferred) or from the
// PLD EDF signal data when STR is unavailable.
type Session struct {
	ID           string    `json:"id"`
	DeviceID     string    `json:"device_id"`
	ImportID     string    `json:"import_id"`
	StartTime    time.Time `json:"start_time"`         // UTC
	EndTime      time.Time `json:"end_time"`           // UTC
	DurationMin  float64   `json:"duration_minutes"`
	AHI          float64   `json:"ahi"`                // apnea-hypopnea index (events/hour)
	LeakRate     float64   `json:"leak_rate_median"`   // L/min
	PressureP50  float64   `json:"pressure_p50"`       // cmH₂O
	PressureP95  float64   `json:"pressure_p95"`       // cmH₂O
	PressureMax  float64   `json:"pressure_max"`       // cmH₂O
	EventCount   int       `json:"event_count"`        // scored respiratory events
	CreatedAt    time.Time `json:"created_at"`
}
