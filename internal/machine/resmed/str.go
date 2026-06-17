// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/riorescue/somnatrace/internal/edf"
)

// STRRecord holds the per-day therapy summary from STR.edf.
type STRRecord struct {
	Date        time.Time
	DurationMin float64

	// Pressure stats (cmH2O)
	MaskPress50  float64
	MaskPress95  float64
	MaskPressMax float64

	// Leak stats (L/s)
	Leak50  float64
	Leak95  float64
	LeakMax float64

	// Indices (events/hour)
	AHI float64
	HI  float64
	AI  float64
	OAI float64
	CAI float64
	UAI float64

	// Respiratory
	RespRate50  float64 // bpm
	MinVent50   float64 // L/min
	TidVol50    float64 // L

	// SpO2 — -1 if not recorded
	SpO250  float64
	SpO295  float64
	SpO2Max float64

	// Mask on/off pairs (minutes from noon local time of that day)
	MaskOnMin  []float64
	MaskOffMin []float64
}

// ParseSTR reads all STR.edf data available at root — including archived copies
// in the STR_Backup/ subdirectory — and returns one record per calendar day.
// Records from the primary STR.edf take precedence; backup files fill any gaps.
// loc is used to interpret EDF header timestamps.
func ParseSTR(root string, loc *time.Location) ([]STRRecord, error) {
	primary, err := parseSTRFile(filepath.Join(root, "STR.edf"), loc)
	if err != nil {
		return nil, fmt.Errorf("resmed: parse STR.edf: %w", err)
	}

	// Build a date-keyed map from primary records (most recent/authoritative).
	byDate := make(map[string]STRRecord, len(primary))
	for _, r := range primary {
		byDate[r.Date.Format("2006-01-02")] = r
	}

	// Merge any archived STR files that cover dates not in the primary.
	backupDir := filepath.Join(root, "STR_Backup")
	if entries, err := os.ReadDir(backupDir); err == nil {
		for _, e := range entries {
			name := strings.ToUpper(e.Name())
			if e.IsDir() || !strings.HasSuffix(name, ".EDF") {
				continue
			}
			recs, err := parseSTRFile(filepath.Join(backupDir, e.Name()), loc)
			if err != nil {
				continue // skip unreadable backup files
			}
			for _, r := range recs {
				key := r.Date.Format("2006-01-02")
				if _, exists := byDate[key]; !exists {
					byDate[key] = r
				}
			}
		}
	}

	// Flatten back to a slice ordered by date.
	records := make([]STRRecord, 0, len(byDate))
	for _, r := range byDate {
		records = append(records, r)
	}
	sortSTRRecords(records)
	return records, nil
}

// parseSTRFile parses a single STR.edf file and returns its records.
func parseSTRFile(path string, loc *time.Location) ([]STRRecord, error) {
	f, err := edf.ReadFile(path, loc)
	if err != nil {
		return nil, err
	}
	return extractSTRRecords(f, loc), nil
}

// extractSTRRecords converts a parsed STR EDF file into per-day STRRecords.
// It accepts both the new AirSense 10 signal names (e.g. "Leak.50") and the
// older S9 signal names (e.g. "Leak Med"), trying each in order.
func extractSTRRecords(f *edf.File, loc *time.Location) []STRRecord {
	idx := strSignalIndex(f)

	// lookupFirst returns the first non-nil sample slice for any of the provided
	// label prefixes (case-insensitive prefix match), or nil if none found.
	lookupFirst := func(labels ...string) []float64 {
		for _, lbl := range labels {
			lower := strings.ToLower(lbl)
			for sigLbl, i := range idx {
				if strings.HasPrefix(strings.ToLower(sigLbl), lower) {
					return f.Signals[i].Samples
				}
			}
		}
		return nil
	}

	getScalar := func(rec int, labels ...string) float64 {
		vals := lookupFirst(labels...)
		if vals == nil || rec >= len(vals) {
			return -1
		}
		return vals[rec]
	}

	getArray := func(rec, perRecord int, labels ...string) []float64 {
		vals := lookupFirst(labels...)
		if vals == nil {
			return nil
		}
		start := rec * perRecord
		end := start + perRecord
		if end > len(vals) {
			return nil
		}
		return vals[start:end]
	}

	n := f.Header.NumDataRecords
	records := make([]STRRecord, 0, n)

	for i := 0; i < n; i++ {
		date := f.Header.StartTime.AddDate(0, 0, i)
		date = time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, loc)

		maskOnRaw  := getArray(i, 20, "MaskOn")
		maskOffRaw := getArray(i, 20, "MaskOff")
		var maskOn, maskOff []float64
		for j := 0; j < 20; j++ {
			if j < len(maskOnRaw) && maskOnRaw[j] >= 0 {
				maskOn  = append(maskOn,  maskOnRaw[j])
				maskOff = append(maskOff, maskOffRaw[j])
			}
		}

		records = append(records, STRRecord{
			Date:        date,
			DurationMin: getScalar(i, "Duration", "Mask Dur"),
			MaskPress50:  getScalar(i, "MaskPress.50", "Mask Pres Med"),
			MaskPress95:  getScalar(i, "MaskPress.95", "Mask Pres 95"),
			MaskPressMax: getScalar(i, "MaskPress.Max", "Mask Pres Max"),
			Leak50:  getScalar(i, "Leak.50", "Leak Med"),
			Leak95:  getScalar(i, "Leak.95", "Leak 95"),
			LeakMax: getScalar(i, "Leak.Max", "Leak Max"),
			AHI: getScalar(i, "AHI"),
			HI:  getScalar(i, "HI"),
			AI:  getScalar(i, "AI"),
			OAI: getScalar(i, "OAI"),
			CAI: getScalar(i, "CAI"),
			UAI: getScalar(i, "UAI"),
			RespRate50: getScalar(i, "RespRate.50", "RR Med"),
			MinVent50:  getScalar(i, "MinVent.50", "Min Vent Med"),
			TidVol50:   getScalar(i, "TidVol.50", "Tid Vol Med"),
			SpO250:  getScalar(i, "SpO2.50", "SpO2 Med"),
			SpO295:  getScalar(i, "SpO2.95", "SpO2 95"),
			SpO2Max: getScalar(i, "SpO2.Max", "SpO2 Max"),
			MaskOnMin:  maskOn,
			MaskOffMin: maskOff,
		})
	}
	return records
}

// FindDayRecord returns the STRRecord whose Date matches targetDate (date-only comparison).
func FindDayRecord(records []STRRecord, targetDate time.Time) (*STRRecord, bool) {
	for i := range records {
		if sameDate(records[i].Date, targetDate) {
			return &records[i], true
		}
	}
	return nil, false
}

func sameDate(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}

// strSignalIndex builds a map from signal label → slice index for a STR file.
func strSignalIndex(f *edf.File) map[string]int {
	m := make(map[string]int, len(f.Signals))
	for i, s := range f.Signals {
		m[s.Label] = i
	}
	return m
}

func sortSTRRecords(recs []STRRecord) {
	for i := 1; i < len(recs); i++ {
		for j := i; j > 0 && recs[j].Date.Before(recs[j-1].Date); j-- {
			recs[j], recs[j-1] = recs[j-1], recs[j]
		}
	}
}
