// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package service

import (
	"fmt"

	"github.com/riorescue/somnatrace/internal/db"
	"github.com/riorescue/somnatrace/internal/models"
)

// SummaryService provides read access to daily therapy summaries and the
// aggregated insights data used by the Insights dashboard.
type SummaryService struct {
	db *db.DB
}

// ListDaily returns up to limit daily summaries ordered newest first.
// limit is clamped to the range [1, 365]; values outside that range default to 30.
func (s *SummaryService) ListDaily(limit int) ([]models.DailySummary, error) {
	if limit <= 0 || limit > 365 {
		limit = 30
	}
	rows, err := s.db.Query(`
		SELECT id, device_id, session_id, date, usage_minutes,
		       ahi, ai_index, hi_index, leak_rate_median, leak_rate_p95,
		       pressure_p50, pressure_p95, pressure_max, parser_version, created_at
		FROM daily_summaries
		ORDER BY date DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list daily summaries: %w", err)
	}
	defer rows.Close()

	var summaries []models.DailySummary
	for rows.Next() {
		var ds models.DailySummary
		if err := rows.Scan(
			&ds.ID, &ds.DeviceID, &ds.SessionID, &ds.Date, &ds.UsageMinutes,
			&ds.AHI, &ds.AIIndex, &ds.HIIndex, &ds.LeakRate, &ds.LeakRateP95,
			&ds.PressureP50, &ds.PressureP95, &ds.PressureMax, &ds.ParserVersion, &ds.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan summary: %w", err)
		}
		summaries = append(summaries, ds)
	}
	return summaries, rows.Err()
}
