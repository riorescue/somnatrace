// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package importer

import (
	"context"
	"fmt"
	"time"

	"github.com/riorescue/somnatrace/internal/machine/sleepstyle"
	"github.com/riorescue/somnatrace/internal/models"
)

// SleepStyleImporter handles Fisher & Paykel SleepStyle CPAP SD cards.
// Session data comes from binary SUM*.FPH files; waveform data (flow,
// pressure, leak) comes from REALTIME/HRD*.EDF files.
type SleepStyleImporter struct{}

// NewSleepStyleImporter returns a new SleepStyleImporter.
func NewSleepStyleImporter() *SleepStyleImporter { return &SleepStyleImporter{} }

// Run scans the SD card at src.Path for SleepStyle device data and returns a
// populated Result containing all sessions with pressure statistics and, where
// available, waveform signals.
func (imp *SleepStyleImporter) Run(_ context.Context, src Source) (*Result, error) {
	root := src.Path

	deviceDirs, err := sleepstyle.FindDeviceDirs(root)
	if err != nil {
		return nil, fmt.Errorf("sleepstyle: %w", err)
	}

	// Use the most recent device directory.
	deviceDir := deviceDirs[len(deviceDirs)-1]

	info, nights, err := sleepstyle.LoadDeviceNights(deviceDir)
	if err != nil {
		return nil, fmt.Errorf("sleepstyle: load nights: %w", err)
	}

	deviceID := deviceIDFromSerial("fp", info.SerialNumber)
	productName := "SleepStyle"
	if info.IsCPAP {
		productName = "SleepStyle CPAP"
	} else {
		productName = "SleepStyle Auto"
	}

	result := &Result{
		DeviceID: deviceID,
		Device: DeviceRecord{
			ID:           deviceID,
			Manufacturer: "Fisher & Paykel",
			SerialNumber: info.SerialNumber,
			ProductName:  productName,
			Family:       string(models.DeviceFamilySleepStyle),
		},
	}

	now := time.Now().UTC()

	for _, n := range nights {
		durSec := n.UseTimeSec
		if durSec < 60 {
			continue // skip sub-minute sessions
		}
		durMin := float64(durSec) / 60.0
		endTime := n.StartTime.Add(time.Duration(durSec) * time.Second)

		sessionModel := models.Session{
			DeviceID:    deviceID,
			StartTime:   n.StartTime,
			EndTime:     endTime,
			DurationMin: durMin,
			PressureP50: n.P95Pressure, // SleepStyle doesn't record P50; use P95 as proxy
			PressureP95: n.P95Pressure,
			PressureMax: n.MaxPressure,
			CreatedAt:   now,
		}

		rec := SessionRecord{
			DeviceID: deviceID,
			Session:  sessionModel,
		}

		// Attach waveform data if available.
		rt := sleepstyle.LoadRealtimeForNight(deviceDir, n.StartTime, endTime)
		if rt != nil {
			// Rebase signal times relative to session start (seconds since n.StartTime).
			edfOffset := rt.StartTime.Sub(n.StartTime).Seconds()
			rec.Signals = buildSignals(rt, edfOffset)
		}

		result.Sessions = append(result.Sessions, rec)
		result.SessionCount++
	}

	return result, nil
}

// buildSignals converts a RealtimeData's signal slices into a SessionSignals
// struct. edfOffset is the number of seconds the EDF file starts before or
// after the session start (positive = EDF starts after session start).
func buildSignals(rt *sleepstyle.RealtimeData, edfOffset float64) *models.SessionSignals {
	if rt == nil {
		return nil
	}
	sig := &models.SessionSignals{}

	sig.Pressure = offsetPoints(rt.Pressure, edfOffset)
	sig.Leak = offsetPoints(rt.Leak, edfOffset)
	sig.Flow = offsetPoints(rt.Flow, edfOffset)

	return sig
}

// offsetPoints shifts all T values by offset seconds.
func offsetPoints(pts []models.SignalPoint, offset float64) []models.SignalPoint {
	if len(pts) == 0 {
		return nil
	}
	out := make([]models.SignalPoint, len(pts))
	for i, p := range pts {
		out[i] = models.SignalPoint{T: p.T + offset, V: p.V}
	}
	return out
}
