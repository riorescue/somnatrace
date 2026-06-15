// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package importer defines the Importer interface and the data types that flow
// between the import pipeline and the service layer. Each supported device
// family provides its own Importer implementation (e.g. ResMedImporter).
// MockImporter is available for development and testing without a real SD card.
package importer

import (
	"context"

	"github.com/somnatrace/somnatrace/internal/models"
)

// DeviceRecord carries the identification fields for a device discovered
// during an import. The service layer upserts this into the devices table.
type DeviceRecord struct {
	ID           string
	SerialNumber string
	ProductName  string
	Family       string
}

// Result is the complete output of a successful import run, containing the
// identified device, all discovered sessions, and raw payload bytes for
// settings and identification snapshots.
type Result struct {
	DeviceID              string
	Device                DeviceRecord
	Sessions              []SessionRecord
	SessionCount          int
	EventCount            int
	Warnings              []string
	SettingsPayload       []byte // raw CurrentSettings.json bytes, stored once per import
	IdentificationPayload []byte // raw Identification.json bytes, stored once per import
}

// SessionRecord is a fully parsed therapy session as returned by an Importer.
// The service layer persists each field into the appropriate table.
type SessionRecord struct {
	DeviceID string
	Session  models.Session
	Events   []models.Event
	Summary  models.DailySummary
	Signals  *models.SessionSignals
}

// Importer is the top-level interface for running a device-specific import pipeline.
type Importer interface {
	// Run validates the source, discovers sessions, parses data, and returns results.
	Run(ctx context.Context, src Source) (*Result, error)
}
