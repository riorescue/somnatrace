// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package sleepstyle

import (
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/riorescue/somnatrace/internal/edf"
	"github.com/riorescue/somnatrace/internal/models"
)

// RealtimeData holds waveform signals extracted from one HRD*.EDF file.
// The SignalPoint slices use T = seconds elapsed since StartTime.
type RealtimeData struct {
	StartTime time.Time
	EndTime   time.Time
	Pressure  []models.SignalPoint // 1 Hz mask pressure (cmH2O)
	Leak      []models.SignalPoint // 1 Hz total leak (L/min)
	Flow      []models.SignalPoint // 25 Hz airway flow (L/min, leak-corrected)
}

// LoadRealtimeForNight finds the HRD*.EDF waveform file whose start time falls
// within the given night's therapy session and returns the parsed signal data.
// Returns nil if no matching file is found (non-fatal).
func LoadRealtimeForNight(deviceDir string, nightStart, nightEnd time.Time) *RealtimeData {
	realtimeDir := filepath.Join(deviceDir, "REALTIME")
	entries, _ := os.ReadDir(realtimeDir)

	for _, e := range entries {
		name := strings.ToUpper(e.Name())
		if !strings.HasPrefix(name, "HRD") || !strings.HasSuffix(name, ".EDF") {
			continue
		}
		path := filepath.Join(realtimeDir, e.Name())
		rd := parseRealtimeEDF(path, nightStart, nightEnd)
		if rd != nil {
			return rd
		}
	}
	return nil
}

// AllRealtimeFiles returns paths of all HRD*.EDF files in the REALTIME
// sub-directory of deviceDir, sorted by name (chronological on SleepStyle).
func AllRealtimeFiles(deviceDir string) []string {
	realtimeDir := filepath.Join(deviceDir, "REALTIME")
	entries, _ := os.ReadDir(realtimeDir)
	var paths []string
	for _, e := range entries {
		name := strings.ToUpper(e.Name())
		if strings.HasPrefix(name, "HRD") && strings.HasSuffix(name, ".EDF") {
			paths = append(paths, filepath.Join(realtimeDir, e.Name()))
		}
	}
	sort.Strings(paths)
	return paths
}

// parseRealtimeEDF reads one HRD*.EDF file. Returns nil if the EDF start time
// does not fall within [nightStart-5min, nightEnd+5min].
func parseRealtimeEDF(path string, nightStart, nightEnd time.Time) *RealtimeData {
	f, err := edf.ReadFile(path, time.UTC)
	if err != nil {
		return nil
	}

	edfStart := f.Header.StartTime
	tolerance := 5 * time.Minute
	if edfStart.Before(nightStart.Add(-tolerance)) || edfStart.After(nightEnd.Add(tolerance)) {
		return nil
	}

	totalDur := time.Duration(float64(f.Header.NumDataRecords)*f.Header.DurationSec*float64(time.Second))
	edfEnd := edfStart.Add(totalDur)

	rd := &RealtimeData{
		StartTime: edfStart,
		EndTime:   edfEnd,
	}

	// The SleepStyle EDF contains three signals:
	//   "Flow"     – 25 Hz, mask airflow + leak (L/min or L/s — apply gain from EDF)
	//   "Pressure" – 1 Hz, mask pressure (cmH2O)
	//   "Leak"     – 1 Hz, total leak (L/min)
	//
	// Airway flow = Flow - (Leak - 500): the device records total leak
	// as leak+500 offset so we must subtract 500 before subtracting from flow.

	pressureSig, hasP := f.SignalByLabel("Pressure")
	leakSig, hasL := f.SignalByLabel("Leak")
	flowSig, hasF := f.SignalByLabel("Flow")

	if hasP {
		rd.Pressure = signalToPoints(edfStart, pressureSig.Samples, 1.0)
	}
	if hasL {
		rd.Leak = signalToPoints(edfStart, leakSig.Samples, 1.0)
	}
	if hasF && hasL {
		// Correct flow by removing leak contribution.
		corrected := make([]float64, len(flowSig.Samples))
		leakHz := float64(len(leakSig.Samples)) / float64(len(flowSig.Samples))
		for i, fv := range flowSig.Samples {
			leakIdx := int(float64(i) * leakHz)
			if leakIdx >= len(leakSig.Samples) {
				leakIdx = len(leakSig.Samples) - 1
			}
			leak := leakSig.Samples[leakIdx]
			corrected[i] = fv - (leak - 500.0)
		}
		rd.Flow = signalToPoints(edfStart, corrected, 25.0)
	} else if hasF {
		rd.Flow = signalToPoints(edfStart, flowSig.Samples, 25.0)
	}

	return rd
}

// signalToPoints converts a flat samples slice to session-relative SignalPoints.
// start is the EDF start time; hz is the sample rate. T is seconds since start.
func signalToPoints(start time.Time, samples []float64, hz float64) []models.SignalPoint {
	if len(samples) == 0 {
		return nil
	}
	pts := make([]models.SignalPoint, 0, len(samples))
	stepSec := 1.0 / hz
	_ = start // kept for potential future absolute-timestamp mode
	for i, v := range samples {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			continue
		}
		pts = append(pts, models.SignalPoint{T: float64(i) * stepSec, V: v})
	}
	return pts
}
