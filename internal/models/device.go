// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package models defines the shared data types used across the service,
// importer, and API layers. All structs are plain value types with JSON tags;
// business logic lives in the service layer, not here.
package models

import "time"

// DeviceFamily identifies the manufacturer/product line of a therapy device.
type DeviceFamily string

const (
	DeviceFamilyResMed       DeviceFamily = "resmed"       // ResMed AirSense / AirCurve series
	DeviceFamilyDreamStation DeviceFamily = "dreamstation" // Philips/Respironics DreamStation 1 & 2
	DeviceFamilySleepStyle   DeviceFamily = "sleepstyle"   // Fisher & Paykel SleepStyle
	DeviceFamilyUnknown      DeviceFamily = "unknown"      // unrecognised or undetected device
)

// Device represents a single physical therapy device identified by serial number.
// One device can have many import operations and sessions over its lifetime.
type Device struct {
	ID           string       `json:"id"`            // "dev-<serial>"
	Family       DeviceFamily `json:"family"`        // device manufacturer/line
	Manufacturer string       `json:"manufacturer"`  // e.g. "ResMed"
	Model        string       `json:"model"`         // e.g. "AirSense 11 AutoSet"
	SerialNumber string       `json:"serial_number"` // from Identification.json
	FirstSeen    time.Time    `json:"first_seen"`    // earliest known session start
	LastSeen     time.Time    `json:"last_seen"`     // most recent session start
	CreatedAt    time.Time    `json:"created_at"`
}
