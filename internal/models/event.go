// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package models

import "time"

// EventType is the clinical classification of a scored respiratory event.
type EventType string

const (
	EventTypeObstructiveApnea EventType = "obstructive_apnea" // complete obstruction ≥ 10 s
	EventTypeCentralApnea     EventType = "central_apnea"     // absent effort ≥ 10 s
	EventTypeHypopnea         EventType = "hypopnea"          // partial reduction in flow ≥ 10 s
	EventTypeSPO2Desat        EventType = "spo2_desaturation" // SpO₂ drop ≥ 3%
	EventTypeLargeLeak        EventType = "large_leak"        // unintentional mask leak above threshold
	EventTypeCSR              EventType = "csr"               // Cheyne-Stokes respiration episode
	EventTypeRERA             EventType = "rera"              // respiratory effort-related arousal
	EventTypeFlowLimitation   EventType = "flow_limitation"   // partial flow restriction without arousal
	EventTypePeriodicBreathing EventType = "periodic_breathing" // cyclic crescendo/decrescendo breathing
)

// Event is one scored respiratory event parsed from an EDF+ EVE annotation file.
// Events are associated with a session and ordered by start time.
type Event struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"session_id"`
	DeviceID    string    `json:"device_id"`
	Type        EventType `json:"type"`
	StartTime   time.Time `json:"start_time"`       // UTC absolute timestamp
	DurationSec float64   `json:"duration_seconds"` // event duration in seconds
	CreatedAt   time.Time `json:"created_at"`
}
