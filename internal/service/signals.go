// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/riorescue/somnatrace/internal/models"
)

// GetIdentification returns the raw Identification.json payload captured at
// import time for the given session, unmarshalled into a generic map.
// Returns nil if no snapshot exists for the session.
func (s *SessionService) GetIdentification(sessionID string) (map[string]any, error) {
	var payload string
	err := s.db.QueryRow(
		`SELECT payload FROM device_identification_snapshots WHERE session_id = ? LIMIT 1`,
		sessionID,
	).Scan(&payload)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get identification: %w", err)
	}
	var result map[string]any
	if err := json.Unmarshal([]byte(payload), &result); err != nil {
		return nil, fmt.Errorf("parse identification payload: %w", err)
	}
	return result, nil
}

// GetSettings returns the raw CurrentSettings.json payload captured at import
// time for the given session, unmarshalled into a generic map.
// Returns nil if no snapshot exists for the session.
func (s *SessionService) GetSettings(sessionID string) (map[string]any, error) {
	var payload string
	err := s.db.QueryRow(
		`SELECT payload FROM settings_snapshots WHERE session_id = ? LIMIT 1`,
		sessionID,
	).Scan(&payload)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get settings: %w", err)
	}
	var result map[string]any
	if err := json.Unmarshal([]byte(payload), &result); err != nil {
		return nil, fmt.Errorf("parse settings payload: %w", err)
	}
	return result, nil
}

// GetFindings returns the clinical analysis findings for a session, ordered by
// severity (critical first) then by position within the session.
func (s *SessionService) GetFindings(sessionID string) ([]models.Finding, error) {
	rows, err := s.db.Query(`
		SELECT id, rule_id, title, detail, severity, start_sec, end_sec
		FROM session_findings
		WHERE session_id = ?
		ORDER BY
		  CASE severity WHEN 'critical' THEN 0 WHEN 'alert' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
		  COALESCE(start_sec, 999999999)
	`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("get findings: %w", err)
	}
	defer rows.Close()

	var findings []models.Finding
	for rows.Next() {
		var f models.Finding
		var startSec, endSec sql.NullFloat64
		if err := rows.Scan(&f.ID, &f.RuleID, &f.Title, &f.Detail, &f.Severity, &startSec, &endSec); err != nil {
			return nil, err
		}
		f.SessionID = sessionID
		if startSec.Valid {
			f.StartSec = &startSec.Float64
		}
		if endSec.Valid {
			f.EndSec = &endSec.Float64
		}
		findings = append(findings, f)
	}
	return findings, rows.Err()
}

// GetFindingsAnalyzedAt returns the UTC timestamp of the most recent analysis
// run for the session (i.e. MAX(created_at) across all findings rows).
// Returns nil if no findings exist yet.
func (s *SessionService) GetFindingsAnalyzedAt(sessionID string) (*time.Time, error) {
	var v sql.NullString
	err := s.db.QueryRow(
		`SELECT MAX(created_at) FROM session_findings WHERE session_id = ?`,
		sessionID,
	).Scan(&v)
	if err != nil {
		return nil, fmt.Errorf("get findings analyzed_at: %w", err)
	}
	if !v.Valid || v.String == "" {
		return nil, nil
	}
	// modernc.org/sqlite stores time.Time values using Go's time.String() format
	// ("2006-01-02 15:04:05.999999999 -0700 MST"). Accept that and RFC3339 for
	// rows written after the storage fix below.
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.999999999 -0700 MST"} {
		if t, err2 := time.Parse(layout, v.String); err2 == nil {
			t = t.UTC()
			return &t, nil
		}
	}
	return nil, fmt.Errorf("could not parse findings analyzed_at: %q", v.String)
}

// GetSignals returns the stored EDF signal time-series for a session.
// Returns nil if no signal data was recorded (e.g. mock or pre-signal imports).
func (s *SessionService) GetSignals(sessionID string) (*models.SessionSignals, error) {
	var pressureJSON, leakJSON, respRateJSON, flowLimJSON, flowJSON string
	err := s.db.QueryRow(`
		SELECT pressure, leak, resp_rate, flow_lim, flow
		FROM session_signals
		WHERE session_id = ?
	`, sessionID).Scan(&pressureJSON, &leakJSON, &respRateJSON, &flowLimJSON, &flowJSON)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get signals: %w", err)
	}

	fromJSON := func(s string) []models.SignalPoint {
		var pts []models.SignalPoint
		json.Unmarshal([]byte(s), &pts) //nolint:errcheck
		return pts
	}

	return &models.SessionSignals{
		SessionID: sessionID,
		Pressure:  fromJSON(pressureJSON),
		Leak:      fromJSON(leakJSON),
		RespRate:  fromJSON(respRateJSON),
		FlowLim:   fromJSON(flowLimJSON),
		Flow:      fromJSON(flowJSON),
	}, nil
}
