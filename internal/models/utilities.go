// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package models

import "time"

// DbStats is the response payload for GET /api/v1/stats. It contains per-table
// row counts, the total on-disk size, and the latest applied migration version.
type DbStats struct {
	Counts        map[string]int `json:"counts"`         // table name → row count
	SizeBytes     int64          `json:"size_bytes"`     // total database size in bytes
	SchemaVersion string         `json:"schema_version"` // latest applied migration version
}

// DetectedCard represents a storage volume that was identified as a known
// therapy device export by the presence of device-specific file signatures.
type DetectedCard struct {
	Path   string       `json:"path"`   // absolute path to the mounted volume
	Family DeviceFamily `json:"family"` // detected device family
}

// Backup describes a single database backup snapshot stored on disk.
type Backup struct {
	ID            string    `json:"id"`
	CreatedAt     time.Time `json:"created_at"`
	SizeBytes     int64     `json:"size_bytes"`
	SchemaVersion string    `json:"schema_version"` // latest migration version at backup time
}
