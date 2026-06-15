// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package edf implements a reader for European Data Format (EDF and EDF+) files.
// EDF is the on-device storage format used by ResMed therapy machines to record
// continuous physiological signals (pressure, flow, leak, SpO₂) and scored
// events (via EDF+D annotation tracks).
//
// Usage:
//
//	f, err := edf.ReadFile("/path/to/session.edf", deviceTimezone)
//	sig, ok := f.SignalByLabel("MaskPress.2s")
package edf

import "errors"

// Sentinel errors returned by the EDF reader. Callers may use errors.Is to
// distinguish between them when deciding whether to skip or abort an import.
var (
	ErrInvalidHeader  = errors.New("edf: invalid file header")  // header is not 256 bytes or cannot be parsed
	ErrUnsupportedFmt = errors.New("edf: unsupported format variant")
	ErrTruncated      = errors.New("edf: file is truncated") // data records extend past end-of-file
)
