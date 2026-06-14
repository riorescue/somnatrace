// Package machine provides device detection and a registry of per-brand import
// pipelines. To add support for a new device family, create a sub-package
// (e.g. internal/machine/philips/), implement the importer.Importer interface,
// and add a detection signature to DefaultDetector.
package machine

import (
	"os"
	"path/filepath"

	"github.com/somnatrace/somnatrace/internal/models"
)

// Detector identifies the device family present at a given import source path.
type Detector interface {
	Detect(path string) (models.DeviceFamily, error)
}

// DefaultDetector probes a directory for well-known file signatures that
// identify a specific device family.
type DefaultDetector struct{}

// Detect returns the device family found at path. It checks for a DATALOG
// directory (ResMed AirSense/AirCurve) and falls back to DeviceFamilyUnknown
// if neither pattern is recognised.
func (d *DefaultDetector) Detect(path string) (models.DeviceFamily, error) {
	// ResMed AirSense devices leave a DATALOG directory and STR.edf.
	if _, err := os.Stat(filepath.Join(path, "DATALOG")); err == nil {
		return models.DeviceFamilyResMed, nil
	}
	if _, err := os.Stat(filepath.Join(path, "STR.edf")); err == nil {
		return models.DeviceFamilyResMed, nil
	}
	return models.DeviceFamilyUnknown, nil
}
