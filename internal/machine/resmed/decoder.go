// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"fmt"
	"io"
	"path/filepath"
	"time"

	"github.com/somnatrace/somnatrace/internal/edf"
)

// Decoder wraps the edf package with ResMed-specific validation helpers.
type Decoder struct{}

// DecodeReader parses an EDF file from r, interpreting timestamps in loc.
func (d *Decoder) DecodeReader(r io.Reader, loc *time.Location) (*edf.File, error) {
	f, err := edf.Read(r, loc)
	if err != nil {
		return nil, fmt.Errorf("resmed decode: %w", err)
	}
	return f, nil
}

// ValidateExtension returns an error if path does not end with .edf or .EDF.
func (d *Decoder) ValidateExtension(path string) error {
	ext := filepath.Ext(path)
	if ext != ".edf" && ext != ".EDF" {
		return fmt.Errorf("resmed: expected .edf file, got %s", path)
	}
	return nil
}
