// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"time"

	"github.com/somnatrace/somnatrace/internal/edf"
	"github.com/somnatrace/somnatrace/internal/models"
)

// MapToSession converts a decoded EDF file header into a normalised Session
// skeleton. Pressure, AHI, and leak statistics are left at zero here and
// filled in later from STR.edf or PLD signal data by the importer.
func MapToSession(f *edf.File, deviceID, importID string) models.Session {
	totalSec := f.Header.DurationSec * float64(f.Header.NumDataRecords)
	end := f.Header.StartTime.Add(time.Duration(totalSec) * time.Second)
	return models.Session{
		DeviceID:    deviceID,
		ImportID:    importID,
		StartTime:   f.Header.StartTime.UTC(),
		EndTime:     end.UTC(),
		DurationMin: totalSec / 60.0,
	}
}
