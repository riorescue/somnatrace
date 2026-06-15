// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"slices"
	"sync"
	"time"

	"github.com/somnatrace/somnatrace/internal/db"
	"github.com/somnatrace/somnatrace/internal/importer"
	"github.com/somnatrace/somnatrace/internal/machine"
	"github.com/somnatrace/somnatrace/internal/models"
)

// SessionCandidate is a lightweight summary of a discovered session shown to
// the user during the review step before they commit sessions to the database.
type SessionCandidate struct {
	ID              string    `json:"id"`
	StartTime       time.Time `json:"start_time"`
	EndTime         time.Time `json:"end_time"`
	DurationMin     float64   `json:"duration_minutes"`
	AHI             float64   `json:"ahi"`
	EventCount      int       `json:"event_count"`
	LeakRate        float64   `json:"leak_rate"`
	PressureP50     float64   `json:"pressure_p50"`
	AlreadyImported bool      `json:"already_imported"`
}

// pendingImport holds the parsed importer result between the parse phase and
// the user-confirmed persist phase. It is stored in ImportService.pending,
// keyed by import ID, and discarded once the import is confirmed or failed.
type pendingImport struct {
	result       *importer.Result
	family       models.DeviceFamily
	candidateIDs []string // pre-generated IDs parallel to result.Sessions
}

// ImportService manages the lifecycle of import operations. It owns the async
// import goroutine and all database writes that happen during an import.
type ImportService struct {
	db      *db.DB
	ana     *AnalysisService
	pending sync.Map // map[importID]*pendingImport; zero value is ready to use
}

// List returns all import records ordered newest first.
func (s *ImportService) List() ([]models.Import, error) {
	rows, err := s.db.Query(`
		SELECT id, COALESCE(device_id, ''), source_path, source_name, status,
		       session_count, COALESCE(error_message, ''), parser_version,
		       started_at, completed_at, created_at
		FROM imports
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list imports: %w", err)
	}
	defer rows.Close()

	var imports []models.Import
	for rows.Next() {
		var imp models.Import
		var completedAt sql.NullTime
		if err := rows.Scan(
			&imp.ID, &imp.DeviceID, &imp.SourcePath, &imp.SourceName,
			&imp.Status, &imp.SessionCount, &imp.ErrorMessage,
			&imp.ParserVersion, &imp.StartedAt, &completedAt, &imp.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan import: %w", err)
		}
		if completedAt.Valid {
			t := completedAt.Time
			imp.CompletedAt = &t
		}
		imports = append(imports, imp)
	}
	return imports, rows.Err()
}

// Create inserts a new import record with status "pending" and returns it.
// The caller should immediately call RunImport to start the pipeline.
func (s *ImportService) Create(sourcePath, sourceName string) (*models.Import, error) {
	id := newID()
	now := time.Now().UTC()

	_, err := s.db.Exec(`
		INSERT INTO imports
		  (id, device_id, source_path, source_name, status, parser_version, started_at, created_at)
		VALUES (?, NULL, ?, ?, 'pending', ?, ?, ?)
	`, id, sourcePath, sourceName, "0.1.0", now, now)
	if err != nil {
		return nil, fmt.Errorf("create import: %w", err)
	}

	return &models.Import{
		ID:            id,
		SourcePath:    sourcePath,
		SourceName:    sourceName,
		Status:        models.ImportStatusPending,
		ParserVersion: "0.1.0",
		StartedAt:     now,
		CreatedAt:     now,
	}, nil
}

// RunImport launches the parse phase of the import pipeline in a background
// goroutine. When parsing completes the import transitions to pending_review
// so the user can select which sessions to commit.
func (s *ImportService) RunImport(importID, sourcePath string) {
	go func() {
		ctx := context.Background()
		if err := s.runImport(ctx, importID, sourcePath); err != nil {
			log.Printf("import %s failed: %v", importID, err)
			s.failImport(importID, err.Error())
		}
	}()
}

// runImport is the parse phase: it detects the device, runs the importer to
// discover sessions and extract signals, then stores the result in-memory and
// transitions the import to pending_review. The user must call Confirm to
// trigger the persist phase.
func (s *ImportService) runImport(ctx context.Context, importID, sourcePath string) error {
	if err := s.setImportStatus(importID, models.ImportStatusRunning, "", 0); err != nil {
		return err
	}

	detector := &machine.DefaultDetector{}
	family, err := detector.Detect(sourcePath)
	if err != nil {
		return fmt.Errorf("detect device: %w", err)
	}

	var imp importer.Importer
	switch family {
	case models.DeviceFamilyResMed:
		imp = importer.NewResMedImporter()
	default:
		return fmt.Errorf("unsupported device family: %s", family)
	}

	src := importer.Source{Path: sourcePath, Name: sourcePath}
	result, err := imp.Run(ctx, src)
	if err != nil {
		return fmt.Errorf("run importer: %w", err)
	}

	candidateIDs := make([]string, len(result.Sessions))
	for i := range result.Sessions {
		candidateIDs[i] = newID()
	}

	s.pending.Store(importID, &pendingImport{
		result:       result,
		family:       family,
		candidateIDs: candidateIDs,
	})

	_, err = s.db.Exec(
		`UPDATE imports SET status = 'pending_review', session_count = ? WHERE id = ?`,
		len(result.Sessions), importID,
	)
	return err
}

// Candidates returns the lightweight session summaries for an import that is
// in pending_review, so the UI can present a selection list. Sessions are
// returned newest-first; those already present in the database are flagged.
func (s *ImportService) Candidates(importID string) ([]SessionCandidate, error) {
	val, ok := s.pending.Load(importID)
	if !ok {
		return nil, fmt.Errorf("no pending candidates for import %s", importID)
	}
	pi := val.(*pendingImport)

	candidates := make([]SessionCandidate, len(pi.result.Sessions))
	for i, sr := range pi.result.Sessions {
		var dummy string
		exists := s.db.QueryRow(
			`SELECT id FROM sessions WHERE device_id = ? AND start_time = ?`,
			sr.Session.DeviceID, sr.Session.StartTime.UTC(),
		).Scan(&dummy) == nil

		candidates[i] = SessionCandidate{
			ID:              pi.candidateIDs[i],
			StartTime:       sr.Session.StartTime,
			EndTime:         sr.Session.EndTime,
			DurationMin:     sr.Session.DurationMin,
			AHI:             sr.Session.AHI,
			EventCount:      len(sr.Events),
			LeakRate:        sr.Session.LeakRate,
			PressureP50:     sr.Session.PressureP50,
			AlreadyImported: exists,
		}
	}

	// Sort newest session first.
	slices.SortFunc(candidates, func(a, b SessionCandidate) int {
		return b.StartTime.Compare(a.StartTime)
	})

	return candidates, nil
}

// Confirm starts the persist phase for the given import, writing only the
// sessions whose IDs appear in selectedIDs to the database. It returns
// immediately; the actual persistence runs in a background goroutine.
func (s *ImportService) Confirm(importID string, selectedIDs []string) error {
	val, ok := s.pending.Load(importID)
	if !ok {
		return fmt.Errorf("no pending candidates for import %s", importID)
	}
	pi := val.(*pendingImport)

	selectedSet := make(map[string]bool, len(selectedIDs))
	for _, id := range selectedIDs {
		selectedSet[id] = true
	}

	// Remove from pending before launching goroutine to prevent double-confirm.
	s.pending.Delete(importID)

	go func() {
		ctx := context.Background()
		if err := s.persistImport(ctx, importID, pi, selectedSet); err != nil {
			log.Printf("confirm import %s failed: %v", importID, err)
			s.failImport(importID, err.Error())
		}
	}()
	return nil
}

// persistImport is the persist phase: it writes the selected sessions and all
// related records (signals, events, settings, summaries) to the database, then
// marks the import complete.
func (s *ImportService) persistImport(ctx context.Context, importID string, pi *pendingImport, selectedSet map[string]bool) error {
	if err := s.setImportStatus(importID, models.ImportStatusRunning, "", 0); err != nil {
		return err
	}

	result := pi.result

	if err := s.upsertDevice(result.Device, pi.family); err != nil {
		return fmt.Errorf("upsert device: %w", err)
	}

	var count int
	for i := range result.Sessions {
		if !selectedSet[pi.candidateIDs[i]] {
			continue
		}
		sr := &result.Sessions[i]
		sr.Session.ImportID = importID

		sessionID, err := s.insertSession(sr.Session)
		if err != nil {
			log.Printf("skip session %s: %v", sr.Session.StartTime, err)
			continue
		}
		count++

		if sr.Signals != nil {
			sr.Signals.SessionID = sessionID
			if err := s.storeSignals(sessionID, sr.Signals); err != nil {
				log.Printf("store signals for %s: %v", sessionID, err)
			} else if s.ana != nil {
				if err := s.ana.RunAndStore(sessionID); err != nil {
					log.Printf("analysis for %s: %v", sessionID, err)
				}
			}
		}

		if len(sr.Events) > 0 {
			if err := s.storeEvents(sessionID, sr.Events); err != nil {
				log.Printf("store events for %s: %v", sessionID, err)
			}
		}

		if result.SettingsPayload != nil {
			if err := s.storeSettings(sessionID, result.DeviceID, result.SettingsPayload, sr.Session.StartTime); err != nil {
				log.Printf("store settings for %s: %v", sessionID, err)
			}
		}

		if result.IdentificationPayload != nil {
			if err := s.storeIdentification(sessionID, result.DeviceID, result.IdentificationPayload, sr.Session.StartTime); err != nil {
				log.Printf("store identification for %s: %v", sessionID, err)
			}
		}

		sr.Summary.SessionID = sessionID
		if err := s.upsertSummary(sr.Summary); err != nil {
			log.Printf("upsert summary for %s: %v", sessionID, err)
		}
	}

	now := time.Now().UTC()
	_, err := s.db.Exec(`
		UPDATE imports SET
		  status        = 'complete',
		  device_id     = ?,
		  session_count = ?,
		  completed_at  = ?
		WHERE id = ?
	`, result.DeviceID, count, now, importID)
	return err
}

// FailPendingReviews marks any imports stuck in pending_review as failed.
// Call this on startup: if the server restarted between parse and confirm,
// the in-memory candidates were lost and the import cannot be completed.
func (s *ImportService) FailPendingReviews() {
	rows, err := s.db.Query(`SELECT id FROM imports WHERE status = 'pending_review'`)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			s.failImport(id, "server restarted before session selection was confirmed")
		}
	}
}

// setImportStatus updates the status, error message, and session count of an import row.
func (s *ImportService) setImportStatus(id string, status models.ImportStatus, errMsg string, sessionCount int) error {
	_, err := s.db.Exec(
		`UPDATE imports SET status = ?, error_message = NULLIF(?, ''), session_count = ? WHERE id = ?`,
		status, errMsg, sessionCount, id,
	)
	return err
}

// failImport marks an import as failed with the given error message and stamps
// completed_at so the UI shows a finished (albeit failed) state.
func (s *ImportService) failImport(id, msg string) {
	now := time.Now().UTC()
	s.db.Exec(`
		UPDATE imports SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?
	`, msg, now, id)
}

// storeSettings upserts the CurrentSettings.json snapshot for a session.
// On conflict (re-import), the payload and captured_at are updated in place.
func (s *ImportService) storeSettings(sessionID, deviceID string, payload []byte, capturedAt time.Time) error {
	id := newID()
	_, err := s.db.Exec(`
		INSERT INTO settings_snapshots (id, device_id, session_id, captured_at, payload, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
		  payload      = excluded.payload,
		  captured_at  = excluded.captured_at
	`, id, deviceID, sessionID, capturedAt.UTC(), string(payload), time.Now().UTC())
	return err
}

// storeIdentification upserts the Identification.json snapshot for a session.
// On conflict (re-import), the payload and captured_at are updated in place.
func (s *ImportService) storeIdentification(sessionID, deviceID string, payload []byte, capturedAt time.Time) error {
	id := newID()
	_, err := s.db.Exec(`
		INSERT INTO device_identification_snapshots (id, device_id, session_id, captured_at, payload, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
		  payload     = excluded.payload,
		  captured_at = excluded.captured_at
	`, id, deviceID, sessionID, capturedAt.UTC(), string(payload), time.Now().UTC())
	return err
}

// storeSignals upserts all EDF signal time-series for a session.
// On conflict (re-import), every channel is replaced.
func (s *ImportService) storeSignals(sessionID string, signals *models.SessionSignals) error {
	toJSON := func(pts []models.SignalPoint) string {
		if pts == nil {
			return "[]"
		}
		b, _ := json.Marshal(pts)
		return string(b)
	}
	_, err := s.db.Exec(`
		INSERT INTO session_signals (session_id, pressure, leak, resp_rate, flow_lim, flow)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
		  pressure  = excluded.pressure,
		  leak      = excluded.leak,
		  resp_rate = excluded.resp_rate,
		  flow_lim  = excluded.flow_lim,
		  flow      = excluded.flow
	`, sessionID,
		toJSON(signals.Pressure), toJSON(signals.Leak),
		toJSON(signals.RespRate), toJSON(signals.FlowLim),
		toJSON(signals.Flow),
	)
	return err
}

// upsertDevice inserts a new device row or updates last_seen on re-import.
func (s *ImportService) upsertDevice(d importer.DeviceRecord, family models.DeviceFamily) error {
	now := time.Now().UTC()
	_, err := s.db.Exec(`
		INSERT INTO devices (id, family, manufacturer, model, serial_number, first_seen, last_seen, created_at)
		VALUES (?, ?, 'ResMed', ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen
	`, d.ID, family, d.ProductName, d.SerialNumber, now, now, now)
	return err
}

// insertSession inserts a new session row and returns its generated ID.
// If a session with the same (device_id, start_time) already exists the
// existing ID is returned without modification (idempotent re-import).
func (s *ImportService) insertSession(sess models.Session) (string, error) {
	var existing string
	err := s.db.QueryRow(
		`SELECT id FROM sessions WHERE device_id = ? AND start_time = ?`,
		sess.DeviceID, sess.StartTime.UTC(),
	).Scan(&existing)
	if err == nil {
		return existing, nil
	}
	if err != sql.ErrNoRows {
		return "", err
	}

	id := newID()
	_, err = s.db.Exec(`
		INSERT INTO sessions
		  (id, device_id, import_id, start_time, end_time,
		   duration_minutes, ahi, leak_rate_median,
		   pressure_p50, pressure_p95, pressure_max, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		id, sess.DeviceID, sess.ImportID,
		sess.StartTime.UTC(), sess.EndTime.UTC(),
		sess.DurationMin, sess.AHI, sess.LeakRate,
		sess.PressureP50, sess.PressureP95, sess.PressureMax,
		time.Now().UTC(),
	)
	if err != nil {
		return "", err
	}
	return id, nil
}

// upsertSummary inserts or updates the daily_summaries row for (device_id, date).
// All aggregate columns are replaced on conflict so that re-imports reflect
// updated parser versions.
func (s *ImportService) upsertSummary(sum models.DailySummary) error {
	id := newID()
	_, err := s.db.Exec(`
		INSERT INTO daily_summaries
		  (id, device_id, session_id, date, usage_minutes,
		   ahi, ai_index, hi_index, leak_rate_median, leak_rate_p95,
		   pressure_p50, pressure_p95, pressure_max, parser_version, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(device_id, date) DO UPDATE SET
		  session_id      = excluded.session_id,
		  usage_minutes   = excluded.usage_minutes,
		  ahi             = excluded.ahi,
		  ai_index        = excluded.ai_index,
		  hi_index        = excluded.hi_index,
		  leak_rate_median = excluded.leak_rate_median,
		  leak_rate_p95   = excluded.leak_rate_p95,
		  pressure_p50    = excluded.pressure_p50,
		  pressure_p95    = excluded.pressure_p95,
		  pressure_max    = excluded.pressure_max,
		  parser_version  = excluded.parser_version
	`,
		id, sum.DeviceID, sum.SessionID, sum.Date, sum.UsageMinutes,
		sum.AHI, sum.AIIndex, sum.HIIndex, sum.LeakRate, sum.LeakRateP95,
		sum.PressureP50, sum.PressureP95, sum.PressureMax, sum.ParserVersion,
		time.Now().UTC(),
	)
	return err
}

// storeEvents inserts all scored respiratory events for a session.
// Duplicate rows (same id) are silently ignored, making this safe to call on
// re-import when the same EVE file is parsed again.
func (s *ImportService) storeEvents(sessionID string, events []models.Event) error {
	now := time.Now().UTC()
	for _, e := range events {
		id := newID()
		if _, err := s.db.Exec(`
			INSERT OR IGNORE INTO events (id, session_id, device_id, type, start_time, duration_sec, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, id, sessionID, e.DeviceID, string(e.Type), e.StartTime.UTC(), e.DurationSec, now); err != nil {
			return err
		}
	}
	return nil
}
