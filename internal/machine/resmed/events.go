// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"strings"
	"time"

	"github.com/somnatrace/somnatrace/internal/edf"
	"github.com/somnatrace/somnatrace/internal/models"
)

// annotationToEventType maps ResMed EVE annotation text to a models.EventType.
// Returns ("", false) for unknown or non-clinical annotations.
var annotationToEventType = map[string]models.EventType{
	"obstructive apnea": models.EventTypeObstructiveApnea,
	"central apnea":     models.EventTypeCentralApnea,
	"hypopnea":          models.EventTypeHypopnea,
	"spo2 desaturation": models.EventTypeSPO2Desat,
	"large leak":        models.EventTypeLargeLeak,
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
