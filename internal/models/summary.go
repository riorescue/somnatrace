// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package models

import "time"

// DailySummary is a denormalised per-night aggregate derived from STR.edf and
// stored in the daily_summaries table. The unique key is (device_id, date); a
// re-import updates the row in place.
type DailySummary struct {
	ID            string    `json:"id"`
	DeviceID      string    `json:"device_id"`
	SessionID     string    `json:"session_id"`
	Date          string    `json:"date"`             // YYYY-MM-DD in the device's local timezone
	UsageMinutes  float64   `json:"usage_minutes"`
	AHI           float64   `json:"ahi"`              // apnea-hypopnea index (events/hour)
	AIIndex       float64   `json:"ai_index"`         // apnea index component
	HIIndex       float64   `json:"hi_index"`         // hypopnea index component
	LeakRate      float64   `json:"leak_rate_median"` // L/min
	LeakRateP95   float64   `json:"leak_rate_p95"`    // L/min
	PressureP50   float64   `json:"pressure_p50"`     // cmH₂O
	PressureP95   float64   `json:"pressure_p95"`     // cmH₂O
	PressureMax   float64   `json:"pressure_max"`     // cmH₂O
	ParserVersion string    `json:"parser_version"`   // allows re-scoring detection
	CreatedAt     time.Time `json:"created_at"`
}
