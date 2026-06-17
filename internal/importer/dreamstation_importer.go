// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package importer

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/riorescue/somnatrace/internal/machine/dreamstation"
	"github.com/riorescue/somnatrace/internal/models"
)

// DreamStationImporter handles Philips Respironics DreamStation 1 and
// DreamStation 2 SD cards. DS1 session files are unencrypted binary chunks;
// DS2 files are encrypted with AES-256-GCM, decrypted on-the-fly using the
// published patient-access key derivation.
type DreamStationImporter struct{}

// NewDreamStationImporter returns a new DreamStationImporter.
func NewDreamStationImporter() *DreamStationImporter { return &DreamStationImporter{} }

// Run scans the SD card at src.Path for all DreamStation device directories,
// parses their sessions and events, and returns a populated Result.
func (imp *DreamStationImporter) Run(_ context.Context, src Source) (*Result, error) {
	root := src.Path

	deviceDirs, err := dreamstation.FindDeviceDirs(root)
	if err != nil {
		return nil, fmt.Errorf("dreamstation: %w", err)
	}
	if len(deviceDirs) == 0 {
		return nil, fmt.Errorf("dreamstation: no device directories found in %s", root)
	}

	// Use the first device directory (most recent, as they are sorted).
	deviceDir := deviceDirs[len(deviceDirs)-1]

	isDS2 := dreamstation.IsDS2DeviceDir(deviceDir)

	info, err := dreamstation.ParseProps(deviceDir)
	if err != nil {
		if isDS2 {
			// DS2 PROP.BIN is encrypted; use the last 6 chars of the dir name as a unique suffix.
			tail := deviceDir
			if len(tail) > 6 {
				tail = tail[len(tail)-6:]
			}
			info = &dreamstation.DeviceInfo{
				SerialNumber: "DS2-" + tail,
				ProductName:  "DreamStation 2",
				IsDS2:        true,
			}
		} else {
			return nil, fmt.Errorf("dreamstation: parse device properties: %w", err)
		}
	}

	deviceID := deviceIDFromSerial("respironics", info.SerialNumber)

	keyCache := make(dreamstation.DS2KeyCache)
	sessions, err := dreamstation.LoadSessions(deviceDir, isDS2, keyCache, deviceID)
	if err != nil {
		return nil, fmt.Errorf("dreamstation: load sessions: %w", err)
	}

	result := &Result{
		DeviceID: deviceID,
		Device: DeviceRecord{
			ID:           deviceID,
			Manufacturer: "Philips Respironics",
			SerialNumber: info.SerialNumber,
			ProductName:  info.ProductName,
			Family:       string(models.DeviceFamilyDreamStation),
		},
	}

	now := time.Now().UTC()

	for _, s := range sessions {
		durMin := s.Duration.Minutes()
		if durMin < 1 {
			continue
		}

		ahiEvents := s.OACount + s.CACount + s.HYCount
		ahi := 0.0
		if durMin > 0 {
			ahi = float64(ahiEvents) / (durMin / 60.0)
		}

		sessionModel := models.Session{
			DeviceID:    deviceID,
			StartTime:   s.StartTime,
			EndTime:     s.EndTime,
			DurationMin: durMin,
			AHI:         ahi,
			LeakRate:    s.LeakAvg,
			PressureP50: s.PressureAvg,
			PressureP95: s.PressureP95,
			PressureMax: s.PressureMax,
			EventCount:  len(s.Events),
			CreatedAt:   now,
		}

		rec := SessionRecord{
			DeviceID: deviceID,
			Session:  sessionModel,
			Events:   s.Events,
		}
		result.Sessions = append(result.Sessions, rec)
		result.SessionCount++
		result.EventCount += len(s.Events)
	}

	if isDS2 {
		result.Warnings = append(result.Warnings,
			"DreamStation 2 detected: waveform data is currently not imported")
	}

	return result, nil
}

// deviceIDFromSerial derives a stable device UUID from brand + serial number
// using a SHA-256 hash of their concatenation.
func deviceIDFromSerial(brand, serial string) string {
	h := sha256.Sum256([]byte(brand + ":" + serial))
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		h[0:4], h[4:6], h[6:8], h[8:10], h[10:16])
}

