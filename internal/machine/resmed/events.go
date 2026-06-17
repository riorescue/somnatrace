// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"strings"
	"time"

	"github.com/riorescue/somnatrace/internal/edf"
	"github.com/riorescue/somnatrace/internal/models"
)

// annotationToEventType maps EVE annotation text to a models.EventType.
// Returns ("", false) for unknown or non-clinical annotations.
var annotationToEventType = map[string]models.EventType{
	"obstructive apnea":  models.EventTypeObstructiveApnea,
	"central apnea":      models.EventTypeCentralApnea,
	"hypopnea":           models.EventTypeHypopnea,
	"spo2 desaturation":  models.EventTypeSPO2Desat,
	"large leak":         models.EventTypeLargeLeak,
	"rera":               models.EventTypeRERA,
	"flow limitation":    models.EventTypeFlowLimitation,
	"periodic breathing": models.EventTypePeriodicBreathing,
}

// ParseEVEEvents extracts clinical events from an EVE EDF+D file.
// deviceID is stamped onto each returned Event; SessionID is left empty
// and must be set by the caller once a session row has been inserted.
func ParseEVEEvents(f *edf.File, deviceID string) []models.Event {
	if f == nil {
		return nil
	}
	anns := edf.ParseAnnotations(f)
	fileStart := f.Header.StartTime

	var events []models.Event
	for _, a := range anns {
		evType, ok := annotationToEventType[strings.ToLower(a.Text)]
		if !ok {
			continue
		}
		startTime := fileStart.Add(time.Duration(a.OnsetSec * float64(time.Second)))
		events = append(events, models.Event{
			DeviceID:    deviceID,
			Type:        evType,
			StartTime:   startTime.UTC(),
			DurationSec: a.DurationSec,
		})
	}
	return events
}

// ParseCSLEvents extracts Cheyne-Stokes Respiration episodes from a CSL EDF+D
// file. The device writes paired "CSR Start" / "CSR End" annotations; each pair
// becomes one EventTypeCSR event whose duration spans the two annotations.
// Unpaired starts (no matching end before the next start) are emitted with zero
// duration so that data is not silently lost.
func ParseCSLEvents(f *edf.File, deviceID string) []models.Event {
	if f == nil {
		return nil
	}
	anns := edf.ParseAnnotations(f)
	fileStart := f.Header.StartTime

	var events []models.Event
	var pendingStart time.Time

	for _, a := range anns {
		lower := strings.ToLower(strings.TrimSpace(a.Text))
		t := fileStart.Add(time.Duration(a.OnsetSec * float64(time.Second)))

		switch lower {
		case "csr start":
			if !pendingStart.IsZero() {
				// Previous start had no end — emit with zero duration.
				events = append(events, models.Event{
					DeviceID:  deviceID,
					Type:      models.EventTypeCSR,
					StartTime: pendingStart.UTC(),
				})
			}
			pendingStart = t

		case "csr end", "cs resumes":
			if !pendingStart.IsZero() {
				dur := t.Sub(pendingStart).Seconds()
				events = append(events, models.Event{
					DeviceID:    deviceID,
					Type:        models.EventTypeCSR,
					StartTime:   pendingStart.UTC(),
					DurationSec: dur,
				})
				pendingStart = time.Time{}
			}
		}
	}

	// Flush any trailing unpaired start.
	if !pendingStart.IsZero() {
		events = append(events, models.Event{
			DeviceID:  deviceID,
			Type:      models.EventTypeCSR,
			StartTime: pendingStart.UTC(),
		})
	}

	return events
}
