// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package models

// SignalPoint is a single time-stamped sample in an EDF signal time-series.
type SignalPoint struct {
	T float64 `json:"t"` // seconds elapsed since session start
	V float64 `json:"v"` // physical value in the signal's native unit
}

// SessionSignals holds the decoded EDF signal data for one therapy session.
// Each slice is an ordered series of SignalPoints sampled at the rate noted below.
type SessionSignals struct {
	SessionID string        `json:"session_id"`
	Pressure  []SignalPoint `json:"pressure"`  // MaskPress.2s — cmH₂O, 2 s intervals
	Leak      []SignalPoint `json:"leak"`      // Leak.2s converted to L/min, 2 s intervals
	RespRate  []SignalPoint `json:"resp_rate"` // RespRate.2s — breaths/min, 2 s intervals
	FlowLim   []SignalPoint `json:"flow_lim"`  // FlowLim.2s — dimensionless 0–1, 2 s intervals
	Flow      []SignalPoint `json:"flow"`      // Flow.40ms downsampled to 1 Hz — L/s
	SpO2      []SignalPoint `json:"spo2"`      // SA2 SpO2 — % saturation, 1 Hz
	Pulse     []SignalPoint `json:"pulse"`     // SA2 pulse rate — bpm, 1 Hz
}
