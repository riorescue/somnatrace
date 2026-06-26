// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package service

import (
	"fmt"
	"time"

	"github.com/riorescue/somnatrace/internal/models"
)

// InsightsResult is the complete payload for the Insights page.
type InsightsResult struct {
	PeriodDays    int                   `json:"period_days"`
	Summaries     []models.DailySummary `json:"summaries"`    // ASC by date for charting
	EventCounts   map[string]int        `json:"event_counts"` // type → count for the period
	CurrentStreak int                   `json:"current_streak"`
	LongestStreak int                   `json:"longest_streak"`
}

// GetInsights returns all data needed by the Insights dashboard for the last
// `days` calendar days. Streak values are computed from all-time data so they
// are not clipped by the selected period.
func (s *SummaryService) GetInsights(days int) (*InsightsResult, error) {
	if days <= 0 || days > 365 {
		days = 30
	}

	since := time.Now().UTC().AddDate(0, 0, -(days-1)).Format("2006-01-02")

	// ── Summaries (ASC for chronological charting) ────────────────────────────
	rows, err := s.db.Query(`
		SELECT id, device_id, session_id, date, usage_minutes,
		       ahi, ai_index, hi_index, leak_rate_median, leak_rate_p95,
		       pressure_p50, pressure_p95, pressure_max, parser_version, created_at
		FROM daily_summaries
		WHERE date >= ?
		ORDER BY date ASC
	`, since)
	if err != nil {
		return nil, fmt.Errorf("insights summaries: %w", err)
	}
	defer rows.Close()

	summaries := make([]models.DailySummary, 0)
	for rows.Next() {
		var ds models.DailySummary
		if err := rows.Scan(
			&ds.ID, &ds.DeviceID, &ds.SessionID, &ds.Date, &ds.UsageMinutes,
			&ds.AHI, &ds.AIIndex, &ds.HIIndex, &ds.LeakRate, &ds.LeakRateP95,
			&ds.PressureP50, &ds.PressureP95, &ds.PressureMax, &ds.ParserVersion, &ds.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan insights summary: %w", err)
		}
		summaries = append(summaries, ds)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// ── Event counts for the period ───────────────────────────────────────────
	// Join through daily_summaries.date (clean YYYY-MM-DD) to avoid SQLite
	// failing to parse the "+0000 UTC" suffix in the stored start_time strings.
	eRows, err := s.db.Query(`
		SELECT e.type, COUNT(*) AS cnt
		FROM events e
		JOIN daily_summaries ds ON ds.session_id = e.session_id
		WHERE ds.date >= ?
		GROUP BY e.type
	`, since)
	if err != nil {
		return nil, fmt.Errorf("insights event counts: %w", err)
	}
	defer eRows.Close()

	eventCounts := make(map[string]int)
	for eRows.Next() {
		var typ string
		var cnt int
		if err := eRows.Scan(&typ, &cnt); err != nil {
			return nil, fmt.Errorf("scan event count: %w", err)
		}
		eventCounts[typ] = cnt
	}
	if err := eRows.Err(); err != nil {
		return nil, err
	}

	// ── Streaks (all-time) ────────────────────────────────────────────────────
	current, longest, err := s.computeStreaks()
	if err != nil {
		return nil, err
	}

	return &InsightsResult{
		PeriodDays:    days,
		Summaries:     summaries,
		EventCounts:   eventCounts,
		CurrentStreak: current,
		LongestStreak: longest,
	}, nil
}

// computeStreaks scans all compliant nights (usage ≥ 4 hours) and returns
// the current consecutive streak and the all-time longest streak.
func (s *SummaryService) computeStreaks() (current, longest int, err error) {
	rows, err := s.db.Query(`
		SELECT date FROM daily_summaries
		WHERE usage_minutes >= 240
		ORDER BY date DESC
	`)
	if err != nil {
		return 0, 0, fmt.Errorf("streak query: %w", err)
	}
	defer rows.Close()

	var dates []time.Time
	for rows.Next() {
		var ds string
		if err := rows.Scan(&ds); err != nil {
			return 0, 0, err
		}
		t, parseErr := time.Parse("2006-01-02", ds)
		if parseErr != nil {
			continue
		}
		dates = append(dates, t.UTC().Truncate(24*time.Hour))
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	if len(dates) == 0 {
		return 0, 0, nil
	}

	// Current streak: count consecutive days backward from the most recent.
	// If the last compliant night was more than 1 day ago, the streak is broken.
	today := time.Now().UTC().Truncate(24 * time.Hour)
	daysSinceLast := int(today.Sub(dates[0]).Hours() / 24)
	if daysSinceLast <= 1 {
		current = 1
		for i := 1; i < len(dates); i++ {
			if int(dates[i-1].Sub(dates[i]).Hours()/24) == 1 {
				current++
			} else {
				break
			}
		}
	}

	// Longest streak ever.
	run := 1
	longest = 1
	for i := 1; i < len(dates); i++ {
		if int(dates[i-1].Sub(dates[i]).Hours()/24) == 1 {
			run++
			if run > longest {
				longest = run
			}
		} else {
			run = 1
		}
	}
	if current > longest {
		longest = current
	}

	return current, longest, nil
}
