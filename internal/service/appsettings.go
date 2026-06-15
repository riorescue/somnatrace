// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package service

import (
	"database/sql"
	"fmt"
	"strconv"

	"github.com/somnatrace/somnatrace/internal/db"
)

const (
	KeyComplianceHours = "compliance_hours_threshold"
	KeyCompliancePct   = "compliance_pct_threshold"
	KeyLeakWarnP95     = "leak_warn_p95"
	KeyLeakAlertP95    = "leak_alert_p95"
)

// AppSettingsService manages user-configurable application settings.
type AppSettingsService struct {
	db *db.DB
}

// AppSettings is the full settings payload returned to clients.
type AppSettings struct {
	ComplianceHoursThreshold float64 `json:"compliance_hours_threshold"`
	CompliancePctThreshold   float64 `json:"compliance_pct_threshold"`
	LeakWarnP95              float64 `json:"leak_warn_p95"`
	LeakAlertP95             float64 `json:"leak_alert_p95"`
	// FirstSessionDate is the earliest date (YYYY-MM-DD) for which a daily
	// summary exists, or nil when no sessions have been imported yet.
	FirstSessionDate *string `json:"first_session_date"`
}

// Get reads all persisted settings and augments them with derived fields.
func (s *AppSettingsService) Get() (*AppSettings, error) {
	rows, err := s.db.Query(`SELECT key, value FROM app_settings`)
	if err != nil {
		return nil, fmt.Errorf("query app_settings: %w", err)
	}
	defer rows.Close()

	kv := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, fmt.Errorf("scan app_settings: %w", err)
		}
		kv[k] = v
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate app_settings: %w", err)
	}

	hours    := parseFloatOr(kv[KeyComplianceHours], 4.0)
	pct      := parseFloatOr(kv[KeyCompliancePct], 70.0)
	leakWarn := parseFloatOr(kv[KeyLeakWarnP95], 24.0)
	leakAlert := parseFloatOr(kv[KeyLeakAlertP95], 40.0)

	// Earliest session date is derived from data, never stored as a setting.
	var firstDate *string
	var ns sql.NullString
	if err := s.db.QueryRow(`SELECT MIN(date) FROM daily_summaries`).Scan(&ns); err == nil && ns.Valid {
		firstDate = &ns.String
	}

	return &AppSettings{
		ComplianceHoursThreshold: hours,
		CompliancePctThreshold:   pct,
		LeakWarnP95:              leakWarn,
		LeakAlertP95:             leakAlert,
		FirstSessionDate:         firstDate,
	}, nil
}

// SetFloat persists a named setting as its string representation.
// Only recognised keys are accepted; unknown keys return an error.
func (s *AppSettingsService) SetFloat(key string, value float64) error {
	switch key {
	case KeyComplianceHours, KeyCompliancePct, KeyLeakWarnP95, KeyLeakAlertP95:
	default:
		return fmt.Errorf("unknown setting key: %q", key)
	}
	_, err := s.db.Exec(`
		INSERT INTO app_settings (key, value, updated_at)
		VALUES (?, ?, datetime('now'))
		ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
	`, key, strconv.FormatFloat(value, 'f', -1, 64))
	if err != nil {
		return fmt.Errorf("upsert app_settings %q: %w", key, err)
	}
	return nil
}

func parseFloatOr(s string, def float64) float64 {
	if s == "" {
		return def
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return def
	}
	return v
}
