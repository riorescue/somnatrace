// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package importer

import (
	"context"
	"time"

	"github.com/somnatrace/somnatrace/internal/models"
)

// MockImporter is a drop-in Importer that returns seven days of synthetic
// session data without reading any real device files. It is used for UI
// development when no SD card is available.
type MockImporter struct{}

// Run returns a fixed set of synthetic sessions starting seven days ago.
func (m *MockImporter) Run(_ context.Context, src Source) (*Result, error) {
	base := time.Now().AddDate(0, 0, -7)
	deviceID := "dev-mock-001"

	sessions := make([]SessionRecord, 7)
	for i := range sessions {
		night := base.AddDate(0, 0, i)
		start := time.Date(night.Year(), night.Month(), night.Day(), 22, 30, 0, 0, time.UTC)
		end := start.Add(7*time.Hour + 15*time.Minute)

		sess := models.Session{
			DeviceID:    deviceID,
			StartTime:   start,
			EndTime:     end,
			DurationMin: end.Sub(start).Minutes(),
			AHI:         float64(2+i%4) + 0.3,
			LeakRate:    float64(4 + i%3),
			PressureP50: 8.0 + float64(i%3)*0.2,
			PressureP95: 11.0 + float64(i%2)*0.5,
			PressureMax: 14.0,
		}
		sessions[i] = SessionRecord{DeviceID: deviceID, Session: sess}
	}

	return &Result{
		DeviceID: deviceID,
		Device: DeviceRecord{
			ID:           deviceID,
			SerialNumber: "MOCK-00001",
			ProductName:  "Mock Device",
			Family:       "unknown",
		},
		Sessions:     sessions,
		SessionCount: len(sessions),
	}, nil
}
