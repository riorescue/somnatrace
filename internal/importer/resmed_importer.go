// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package importer

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/somnatrace/somnatrace/internal/edf"
	"github.com/somnatrace/somnatrace/internal/machine/resmed"
	"github.com/somnatrace/somnatrace/internal/models"
)

// ResMedImporter reads a mirrored ResMed SD card directory and produces
// normalised SessionRecords for each therapy session found in DATALOG/.
type ResMedImporter struct{}

// NewResMedImporter returns a new ResMedImporter.
func NewResMedImporter() *ResMedImporter { return &ResMedImporter{} }

// Run is the top-level import pipeline for ResMed devices. It:
//  1. Reads the device timezone from CurrentSettings.json.
//  2. Reads raw settings and identification JSON for per-session snapshots.
//  3. Parses STR.edf for daily therapy summaries and AHI/pressure/leak stats.
//  4. Discovers all session EDF bundles in DATALOG/ and extracts signals.
//  5. Parses EVE files for scored respiratory events.
func (r *ResMedImporter) Run(_ context.Context, src Source) (*Result, error) {
	loc, err := resmed.ParseDeviceTimezone(src.Path)
	if err != nil {
		return nil, fmt.Errorf("parse device timezone: %w", err)
	}

	settings, _ := resmed.ParseDeviceSettings(src.Path)     // best-effort; nil if absent
	idPayload, _ := resmed.ParseIdentificationRaw(src.Path) // best-effort; nil if absent

	dev, err := resmed.ParseIdentification(src.Path)
	if err != nil {
		return nil, fmt.Errorf("identify device: %w", err)
	}

	strRecords, err := resmed.ParseSTR(src.Path, loc)
	if err != nil {
		return nil, fmt.Errorf("parse STR.edf: %w", err)
	}

	bundles, err := resmed.DiscoverSessions(src.Path, loc)
	if err != nil {
		return nil, fmt.Errorf("discover sessions: %w", err)
	}

	deviceID := "dev-" + sanitizeID(dev.SerialNumber)

	var sessions []SessionRecord
	for _, b := range bundles {
		start := b.StartTime()
		if start.IsZero() {
			continue
		}
		end := b.EndTime()
		dur := end.Sub(start).Minutes()

		str, hasSTR := resmed.FindDayRecord(strRecords, b.Date)

		sess := models.Session{
			DeviceID:    deviceID,
			StartTime:   start.UTC(),
			EndTime:     end.UTC(),
			DurationMin: dur,
		}
		var summary models.DailySummary

		if hasSTR {
			// Prefer STR.edf statistics: they are device-computed and already
			// aggregated, giving accurate AHI and pressure percentiles.
			sess.AHI = str.AHI
			sess.LeakRate = str.Leak50 * 60.0 // L/s → L/min
			sess.PressureP50 = str.MaskPress50
			sess.PressureP95 = str.MaskPress95
			sess.PressureMax = str.MaskPressMax

			summary = models.DailySummary{
				DeviceID:      deviceID,
				Date:          localDate(start, loc),
				UsageMinutes:  str.DurationMin,
				AHI:           str.AHI,
				HIIndex:       str.HI,
				AIIndex:       str.AI,
				LeakRate:      str.Leak50 * 60.0,
				LeakRateP95:   str.Leak95 * 60.0,
				PressureP50:   str.MaskPress50,
				PressureP95:   str.MaskPress95,
				PressureMax:   str.MaskPressMax,
				ParserVersion: "0.1.0",
			}
		} else {
			// Fall back to computing stats from the raw PLD signal data.
			if b.PLD != nil {
				if sig, ok := b.PLD.SignalByLabel("Press.2s"); ok {
					p50, p95, pmax := pctiles(sig.Samples)
					sess.PressureP50, sess.PressureP95, sess.PressureMax = p50, p95, pmax
				}
				if sig, ok := b.PLD.SignalByLabel("Leak.2s"); ok {
					med, p95, _ := pctiles(sig.Samples)
					sess.LeakRate = med * 60.0
					summary.LeakRateP95 = p95 * 60.0
				}
			}
			summary.DeviceID = deviceID
			summary.Date = localDate(start, loc)
			summary.UsageMinutes = dur
			summary.ParserVersion = "0.1.0"
		}

		sessions = append(sessions, SessionRecord{
			DeviceID: deviceID,
			Session:  sess,
			Summary:  summary,
			Signals:  extractSignals(b.PLD, b.BRP),
			Events:   resmed.ParseEVEEvents(b.EVE, deviceID),
		})
	}

	return &Result{
		DeviceID: deviceID,
		Device: DeviceRecord{
			ID:           deviceID,
			SerialNumber: dev.SerialNumber,
			ProductName:  dev.ProductName,
			Family:       string(models.DeviceFamilyResMed),
		},
		Sessions:              sessions,
		SessionCount:          len(sessions),
		SettingsPayload:       settings,
		IdentificationPayload: idPayload,
	}, nil
}

// localDate returns the YYYY-MM-DD calendar date of t in loc.
func localDate(t time.Time, loc *time.Location) string {
	return t.In(loc).Format("2006-01-02")
}

// sanitizeID strips all non-alphanumeric characters from s, producing a safe
// identifier component (e.g. for the "dev-<serial>" device ID).
func sanitizeID(s string) string {
	out := make([]byte, 0, len(s))
	for _, c := range []byte(s) {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') {
			out = append(out, c)
		}
	}
	return string(out)
}

// extractSignals builds a SessionSignals from the PLD (2-second derived stats)
// and BRP (25 Hz raw waveform) EDF files. Either may be nil; the corresponding
// signal slices will simply be empty.
func extractSignals(pld, brp *edf.File) *models.SessionSignals {
	if pld == nil && brp == nil {
		return nil
	}
	sig := &models.SessionSignals{}

	if pld != nil {
		const step = 2.0
		if s, ok := pld.SignalByLabel("MaskPress.2s"); ok {
			sig.Pressure = makePts(s.Samples, step)
		}
		if s, ok := pld.SignalByLabel("Leak.2s"); ok {
			// Leak.2s is stored in L/s; convert to L/min for display.
			scaled := make([]float64, len(s.Samples))
			for i, v := range s.Samples {
				scaled[i] = v * 60
			}
			sig.Leak = makePts(scaled, step)
		}
		if s, ok := pld.SignalByLabel("RespRate.2s"); ok {
			sig.RespRate = makePts(s.Samples, step)
		}
		if s, ok := pld.SignalByLabel("FlowLim.2s"); ok {
			sig.FlowLim = makePts(s.Samples, step)
		}
	}

	if brp != nil {
		// Flow.40ms is sampled at 25 Hz; downsample by a factor of 25 to 1 Hz.
		if s, ok := brp.SignalByLabel("Flow.40ms"); ok {
			sig.Flow = downsamplePts(s.Samples, 25, 1.0)
		}
	}

	return sig
}

// makePts converts a flat sample slice into a []SignalPoint where T increases
// by intervalSec for each sample, rounded to two decimal places.
func makePts(samples []float64, intervalSec float64) []models.SignalPoint {
	pts := make([]models.SignalPoint, len(samples))
	for i, v := range samples {
		pts[i] = models.SignalPoint{
			T: math.Round(float64(i)*intervalSec*100) / 100,
			V: math.Round(v*1000) / 1000,
		}
	}
	return pts
}

// downsamplePts picks every stride-th sample and assigns a timestamp based on
// outIntervalSec, producing a lower-frequency series.
func downsamplePts(samples []float64, stride int, outIntervalSec float64) []models.SignalPoint {
	var pts []models.SignalPoint
	for i := 0; i < len(samples); i += stride {
		pts = append(pts, models.SignalPoint{
			T: math.Round(float64(i/stride)*outIntervalSec*100) / 100,
			V: math.Round(samples[i]*1000) / 1000,
		})
	}
	return pts
}

// pctiles returns the p50, p95, and maximum of vals using linear interpolation.
func pctiles(vals []float64) (p50, p95, pmax float64) {
	if len(vals) == 0 {
		return
	}
	sorted := make([]float64, len(vals))
	copy(sorted, vals)
	sort.Float64s(sorted)
	n := len(sorted)
	lerp := func(p float64) float64 {
		idx := p / 100.0 * float64(n-1)
		lo := int(idx)
		if lo+1 >= n {
			return sorted[n-1]
		}
		frac := idx - float64(lo)
		return sorted[lo]*(1-frac) + sorted[lo+1]*frac
	}
	return lerp(50), lerp(95), sorted[n-1]
}
