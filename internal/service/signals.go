package service

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/somnatrace/somnatrace/internal/models"
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
