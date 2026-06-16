// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package service

import (
	"database/sql"
	"fmt"
	"strings"

	"github.com/somnatrace/somnatrace/internal/db"
	"github.com/somnatrace/somnatrace/internal/models"
)

// SessionService provides read access to sessions, events, and clinical findings.
type SessionService struct {
	db *db.DB
}

// List returns all sessions ordered newest first. Each row includes a live
// count of its associated events via a correlated subquery.
func (s *SessionService) List() ([]models.Session, error) {
	return s.listQuery(`
		SELECT id, device_id, import_id, start_time, end_time,
		       duration_minutes, ahi, leak_rate_median,
		       pressure_p50, pressure_p95, pressure_max,
		       (SELECT COUNT(*) FROM events WHERE session_id = sessions.id) AS event_count,
		       created_at, mask_id, notes, morning_feel
		FROM sessions
		ORDER BY start_time DESC
	`)
}

// ListByEventType returns sessions that contain at least one event of the given
// type on or after since (YYYY-MM-DD).
func (s *SessionService) ListByEventType(eventType, since string) ([]models.Session, error) {
	return s.listQuery(`
		SELECT DISTINCT sess.id, sess.device_id, sess.import_id, sess.start_time, sess.end_time,
		       sess.duration_minutes, sess.ahi, sess.leak_rate_median,
		       sess.pressure_p50, sess.pressure_p95, sess.pressure_max,
		       (SELECT COUNT(*) FROM events WHERE session_id = sess.id) AS event_count,
		       sess.created_at, sess.mask_id, sess.notes, sess.morning_feel
		FROM sessions sess
		JOIN events e ON e.session_id = sess.id
		JOIN daily_summaries ds ON ds.session_id = sess.id
		WHERE e.type = ? AND ds.date >= ?
		ORDER BY sess.start_time DESC
	`, eventType, since)
}

func (s *SessionService) listQuery(query string, args ...any) ([]models.Session, error) {
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []models.Session
	for rows.Next() {
		sess, err := scanSession(rows.Scan)
		if err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		sessions = append(sessions, sess)
	}
	return sessions, rows.Err()
}

// Get returns the session with the given id, or nil if it does not exist.
func (s *SessionService) Get(id string) (*models.Session, error) {
	row := s.db.QueryRow(`
		SELECT id, device_id, import_id, start_time, end_time,
		       duration_minutes, ahi, leak_rate_median,
		       pressure_p50, pressure_p95, pressure_max,
		       (SELECT COUNT(*) FROM events WHERE session_id = sessions.id) AS event_count,
		       created_at, mask_id, notes, morning_feel
		FROM sessions
		WHERE id = ?
	`, id)
	sess, err := scanSession(row.Scan)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get session %s: %w", id, err)
	}
	return &sess, nil
}

// scanSession reads one session row using the provided scan function.
func scanSession(scan func(...any) error) (models.Session, error) {
	var sess models.Session
	var maskID, notes, morningFeel sql.NullString
	err := scan(
		&sess.ID, &sess.DeviceID, &sess.ImportID, &sess.StartTime, &sess.EndTime,
		&sess.DurationMin, &sess.AHI, &sess.LeakRate,
		&sess.PressureP50, &sess.PressureP95, &sess.PressureMax,
		&sess.EventCount, &sess.CreatedAt, &maskID, &notes, &morningFeel,
	)
	if err != nil {
		return models.Session{}, err
	}
	if maskID.Valid {
		sess.MaskID = &maskID.String
	}
	if notes.Valid {
		sess.Notes = &notes.String
	}
	if morningFeel.Valid {
		sess.MorningFeel = &morningFeel.String
	}
	return sess, nil
}

// SessionPatch carries nullable updates for user-editable session metadata.
// A nil pointer means "leave unchanged"; a non-nil pointer (including one
// pointing to an empty string) means "set to this value" (empty = clear).
type SessionPatch struct {
	MaskID      *string
	Notes       *string
	MorningFeel *string
}

// PatchMetadata updates only the fields present in p, leaving others unchanged.
func (s *SessionService) PatchMetadata(id string, p SessionPatch) error {
	var setClauses []string
	var args []any

	if p.MaskID != nil {
		setClauses = append(setClauses, "mask_id = NULLIF(?, '')")
		args = append(args, *p.MaskID)
	}
	if p.Notes != nil {
		setClauses = append(setClauses, "notes = NULLIF(?, '')")
		args = append(args, *p.Notes)
	}
	if p.MorningFeel != nil {
		setClauses = append(setClauses, "morning_feel = NULLIF(?, '')")
		args = append(args, *p.MorningFeel)
	}
	if len(setClauses) == 0 {
		return nil
	}

	args = append(args, id)
	_, err := s.db.Exec(
		"UPDATE sessions SET "+strings.Join(setClauses, ", ")+" WHERE id = ?",
		args...,
	)
	return err
}

// GetEvents returns all scored respiratory events for a session, ordered by
// start time ascending.
func (s *SessionService) GetEvents(sessionID string) ([]models.Event, error) {
	rows, err := s.db.Query(`
		SELECT id, session_id, device_id, type, start_time, duration_sec, created_at
		FROM events
		WHERE session_id = ?
		ORDER BY start_time ASC
	`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("get events: %w", err)
	}
	defer rows.Close()

	var events []models.Event
	for rows.Next() {
		var e models.Event
		if err := rows.Scan(&e.ID, &e.SessionID, &e.DeviceID, &e.Type, &e.StartTime, &e.DurationSec, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, e)
	}
	return events, rows.Err()
}
