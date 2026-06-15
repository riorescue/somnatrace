// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"fmt"
	"path/filepath"
	"time"

	"github.com/somnatrace/somnatrace/internal/edf"
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

// ParseSTR reads <root>/STR.edf and returns one record per day.
// loc is used to interpret the EDF header timestamp.
func ParseSTR(root string, loc *time.Location) ([]STRRecord, error) {
	f, err := edf.ReadFile(filepath.Join(root, "STR.edf"), loc)
	if err != nil {
		return nil, fmt.Errorf("resmed: parse STR.edf: %w", err)
	}

	idx := strSignalIndex(f)
	get := func(label string) []float64 {
		i, ok := idx[label]
		if !ok {
			return nil
		}
		return f.Signals[i].Samples
	}
	getScalar := func(label string, rec int) float64 {
		vals := get(label)
		if vals == nil || rec >= len(vals) {
			return -1
		}
		return vals[rec]
	}
	getArray := func(label string, rec, perRecord int) []float64 {
		vals := get(label)
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

		maskOnRaw  := getArray("MaskOn",  i, 20)
		maskOffRaw := getArray("MaskOff", i, 20)
		var maskOn, maskOff []float64
		for j := 0; j < 20; j++ {
			if j < len(maskOnRaw) && maskOnRaw[j] >= 0 {
				maskOn  = append(maskOn,  maskOnRaw[j])
				maskOff = append(maskOff, maskOffRaw[j])
			}
		}

		records = append(records, STRRecord{
			Date:        date,
			DurationMin: getScalar("Duration", i),
			MaskPress50:  getScalar("MaskPress.50", i),
			MaskPress95:  getScalar("MaskPress.95", i),
			MaskPressMax: getScalar("MaskPress.Max", i),
			Leak50:  getScalar("Leak.50", i),
			Leak95:  getScalar("Leak.95", i),
			LeakMax: getScalar("Leak.Max", i),
			AHI: getScalar("AHI", i),
			HI:  getScalar("HI", i),
			AI:  getScalar("AI", i),
			OAI: getScalar("OAI", i),
			CAI: getScalar("CAI", i),
			UAI: getScalar("UAI", i),
			RespRate50: getScalar("RespRate.50", i),
			MinVent50:  getScalar("MinVent.50", i),
			TidVol50:   getScalar("TidVol.50", i),
			SpO250:  getScalar("SpO2.50", i),
			SpO295:  getScalar("SpO2.95", i),
			SpO2Max: getScalar("SpO2.Max", i),
			MaskOnMin:  maskOn,
			MaskOffMin: maskOff,
		})
	}
	return records, nil
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
