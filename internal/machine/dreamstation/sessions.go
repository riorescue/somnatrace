// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package dreamstation

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/riorescue/somnatrace/internal/models"
)

// Session holds all parsed data for a single therapy night.
type Session struct {
	SessionID uint32
	StartTime time.Time
	EndTime   time.Time
	Duration  time.Duration
	Events    []models.Event

	OACount int
	CACount int
	HYCount int
	FLCount int

	// Pressure statistics derived from 2-minute stat intervals.
	PressureMin float64
	PressureMax float64
	PressureAvg float64
	PressureP95 float64
	LeakAvg     float64

	IsBilevel bool
}

// LoadSessions scans a single DreamStation device directory (one of the
// numbered folders inside P-Series) and returns all parsed sessions found
// in its P0/, P1/, … patient-folder sub-directories.
//
// For DS2 device directories, keyCache is used (and populated) to avoid
// redundant PBKDF2 key derivations across multiple files.
func LoadSessions(deviceDir string, isDS2 bool, keyCache DS2KeyCache, deviceID string) ([]*Session, error) {
	// Find P0, P1, … patient folders.
	entries, err := os.ReadDir(deviceDir)
	if err != nil {
		return nil, fmt.Errorf("dreamstation: list device dir %s: %w", deviceDir, err)
	}

	var sessions []*Session
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := strings.ToUpper(e.Name())
		if len(name) < 2 || name[0] != 'P' {
			continue
		}
		if _, convErr := strconv.Atoi(name[1:]); convErr != nil {
			continue
		}
		patientDir := filepath.Join(deviceDir, e.Name())
		slist, err := loadPatientFolder(patientDir, isDS2, keyCache, deviceID)
		if err != nil {
			// Log and continue — don't abort the whole import for one bad folder.
			continue
		}
		sessions = append(sessions, slist...)
	}

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].StartTime.Before(sessions[j].StartTime)
	})
	return sessions, nil
}

// loadPatientFolder returns sessions from one patient folder (P0, P1, etc.).
func loadPatientFolder(patientDir string, isDS2 bool, keyCache DS2KeyCache, deviceID string) ([]*Session, error) {
	entries, err := os.ReadDir(patientDir)
	if err != nil {
		return nil, err
	}

	// Collect session IDs from the summary file extensions present.
	type sessionFiles struct {
		summary string
		events  string
	}
	byID := make(map[string]*sessionFiles)

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := strings.ToUpper(filepath.Ext(name))
		stem := strings.TrimSuffix(name, filepath.Ext(name))

		var normExt string
		if isDS2 {
			// DS2 uses .B01, .B02, etc.
			if !strings.HasPrefix(ext, ".B") {
				continue
			}
			normExt = "." + ext[2:] // ".B01" → ".01"
		} else {
			normExt = ext
		}

		switch normExt {
		case ".001":
			if _, ok := byID[stem]; !ok {
				byID[stem] = &sessionFiles{}
			}
			byID[stem].summary = filepath.Join(patientDir, name)
		case ".002":
			if _, ok := byID[stem]; !ok {
				byID[stem] = &sessionFiles{}
			}
			byID[stem].events = filepath.Join(patientDir, name)
		}
	}

	var sessions []*Session
	for _, sf := range byID {
		if sf.summary == "" {
			continue
		}
		s, err := parseSessionFiles(sf.summary, sf.events, isDS2, keyCache, deviceID)
		if err != nil || s == nil {
			continue
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}

// parseSessionFiles parses one session's summary and (optionally) events files.
func parseSessionFiles(summaryPath, eventsPath string, isDS2 bool, keyCache DS2KeyCache, deviceID string) (*Session, error) {
	summaryChunks, err := readSessionFile(summaryPath, isDS2, keyCache)
	if err != nil || len(summaryChunks) == 0 {
		return nil, fmt.Errorf("dreamstation: load summary %s: %w", summaryPath, err)
	}

	// The first summary chunk anchors the session.
	anchor := summaryChunks[0]
	chunkStart := time.Unix(int64(anchor.Timestamp), 0).UTC()
	totalSec, isBilevel := parseSummaryF0V6(anchor)

	if totalSec == 0 {
		return nil, nil // no therapy time
	}

	sess := &Session{
		SessionID: anchor.SessionID,
		StartTime: chunkStart,
		EndTime:   chunkStart.Add(time.Duration(totalSec) * time.Second),
		Duration:  time.Duration(totalSec) * time.Second,
		IsBilevel: isBilevel,
	}

	// Parse events if present.
	if eventsPath != "" {
		eventChunks, _ := readSessionFile(eventsPath, isDS2, keyCache)
		var allStats []StatInterval
		for _, c := range eventChunks {
			cStart := time.Unix(int64(c.Timestamp), 0).UTC()
			result := ParseEventsF0V6(c, cStart, deviceID)
			sess.IsBilevel = sess.IsBilevel || result.IsBilevel
			for _, ev := range result.Events {
				switch ev.Type {
				case models.EventTypeObstructiveApnea:
					sess.OACount++
				case models.EventTypeCentralApnea:
					sess.CACount++
				case models.EventTypeHypopnea:
					sess.HYCount++
				case models.EventTypeFlowLimitation:
					sess.FLCount++
				}
			}
			sess.Events = append(sess.Events, result.Events...)
			allStats = append(allStats, result.Stats...)
		}
		computePressureStats(sess, allStats)
	}

	return sess, nil
}

// parseSummaryF0V6 parses a DreamStation F0V6 summary chunk and returns
// the total session seconds and whether it's a bilevel device.
func parseSummaryF0V6(c *Chunk) (totalSec uint32, isBilevel bool) {
	data := c.Data
	n := len(data)
	pos := 0

	for pos < n {
		code := data[pos]
		pos++

		size, ok := c.HBlock[code]
		if !ok {
			break
		}
		sz := int(size)
		if pos+sz > n {
			break
		}
		payload := data[pos : pos+sz]

		switch code {
		case 0x03, 0x04, 0x02: // Mask On, Mask Off, Equipment Off — all carry a 2-byte time delta.
			if sz >= 2 {
				totalSec += uint32(payload[0]) | uint32(payload[1])<<8
			}
		case 0x0A, 0x0B: // Auto-CPAP setting events.
			// No time delta, just settings.
		case 0x09: // Time elapsed (extra time accounting).
			if sz >= 2 {
				totalSec += uint32(payload[0]) | uint32(payload[1])<<8
			}
		case 0x01: // Settings
			// Check for BiLevel mode in the settings block.
			if sz >= 1 && payload[0] == 0x02 { // mode byte == BiLevel
				isBilevel = true
			}
		}

		pos += sz
	}
	return
}

// computePressureStats derives pressure percentiles from the 2-minute stat
// intervals and stores them on the session.
func computePressureStats(sess *Session, stats []StatInterval) {
	if len(stats) == 0 {
		return
	}

	var pressures []float64
	var totalLeak float64
	for _, s := range stats {
		if s.Pressure > 0 {
			pressures = append(pressures, s.Pressure)
		}
		totalLeak += s.TotalLeak
	}

	if len(pressures) == 0 {
		return
	}

	sort.Float64s(pressures)
	sess.PressureMin = pressures[0]
	sess.PressureMax = pressures[len(pressures)-1]

	sum := 0.0
	for _, p := range pressures {
		sum += p
	}
	sess.PressureAvg = sum / float64(len(pressures))

	p95idx := int(float64(len(pressures)) * 0.95)
	if p95idx >= len(pressures) {
		p95idx = len(pressures) - 1
	}
	sess.PressureP95 = pressures[p95idx]
	sess.LeakAvg = totalLeak / float64(len(stats))
}

// readSessionFile reads chunks from a session file, decrypting DS2 files
// on the fly. Returns nil slices on error (non-fatal at call site).
func readSessionFile(path string, isDS2 bool, keyCache DS2KeyCache) ([]*Chunk, error) {
	if isDS2 {
		plaintext, err := DecryptDS2File(path, keyCache)
		if err != nil {
			return nil, err
		}
		return ReadChunksFromBytes(plaintext)
	}
	return ReadChunks(path)
}
