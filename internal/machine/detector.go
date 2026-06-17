// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package machine provides device detection and a registry of per-brand import
// pipelines. To add support for a new device family, create a sub-package
// (e.g. internal/machine/philips/), implement the importer.Importer interface,
// and add a detection signature to DefaultDetector.
package machine

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/riorescue/somnatrace/internal/models"
)

// Detector identifies the device family present at a given import source path.
type Detector interface {
	Detect(path string) (models.DeviceFamily, error)
}

// DefaultDetector probes a directory for well-known file signatures that
// identify a specific device family.
type DefaultDetector struct{}

// Detect returns the device family found at path. It checks for well-known
// directory signatures in the following order: ResMed, DreamStation, SleepStyle.
func (d *DefaultDetector) Detect(path string) (models.DeviceFamily, error) {
	// ResMed AirSense devices leave a DATALOG directory and STR.edf.
	if _, err := os.Stat(filepath.Join(path, "DATALOG")); err == nil {
		return models.DeviceFamilyResMed, nil
	}
	if _, err := os.Stat(filepath.Join(path, "STR.edf")); err == nil {
		return models.DeviceFamilyResMed, nil
	}

	// Philips DreamStation devices store data in a P-Series directory (any case).
	if pseriesPath := findPSeriesPath(path); pseriesPath != "" {
		return models.DeviceFamilyDreamStation, nil
	}

	// Fisher & Paykel SleepStyle: look for FPHCARE/ICON directory tree.
	if hasSleepStyleLayout(path) {
		return models.DeviceFamilySleepStyle, nil
	}

	return models.DeviceFamilyUnknown, nil
}

// findPSeriesPath returns the path to the P-Series folder (case-insensitive)
// if it exists under root, otherwise "".
func findPSeriesPath(root string) string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return ""
	}
	for _, e := range entries {
		if e.IsDir() && strings.EqualFold(e.Name(), "P-Series") {
			candidate := filepath.Join(root, e.Name())
			// Confirm it contains at least one device directory with a properties file.
			if hasPSeriesDevice(candidate) {
				return candidate
			}
		}
	}
	return ""
}

// hasPSeriesDevice reports whether pseriesDir holds at least one device
// sub-directory containing PROP.TXT, properties.txt, or PROP.BIN.
func hasPSeriesDevice(pseriesDir string) bool {
	entries, err := os.ReadDir(pseriesDir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		sub := filepath.Join(pseriesDir, e.Name())
		if hasPropFile(sub) {
			return true
		}
	}
	return false
}

// hasPropFile reports whether dir directly contains a DreamStation properties file.
func hasPropFile(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		switch strings.ToUpper(e.Name()) {
		case "PROP.TXT", "PROPERTIES.TXT", "PROP.BIN":
			return true
		}
	}
	return false
}

// hasSleepStyleLayout reports whether root contains the FPHCARE/ICON directory
// tree that identifies a Fisher & Paykel SleepStyle SD card.
func hasSleepStyleLayout(root string) bool {
	iconDir := filepath.Join(root, "FPHCARE", "ICON")
	entries, err := os.ReadDir(iconDir)
	if err != nil {
		return false
	}
	// At least one subdirectory of ICON must contain a SUM*.fph file.
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		sub := filepath.Join(iconDir, e.Name())
		if hasFPHSumFile(sub) {
			return true
		}
	}
	return false
}

// hasFPHSumFile reports whether dir contains at least one SUM*.fph file.
func hasFPHSumFile(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		name := strings.ToUpper(e.Name())
		if strings.HasPrefix(name, "SUM") && strings.HasSuffix(name, ".FPH") {
			return true
		}
	}
	return false
}
