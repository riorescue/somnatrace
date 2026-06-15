// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package edf

import "time"

// Header holds the parsed EDF/EDF+ fixed header.
type Header struct {
	Version         string
	LocalPatient    string
	LocalRecording  string
	StartTime       time.Time // parsed, in the timezone passed to Read
	NumBytesHeader  int
	Reserved        string
	IsEDFPlus       bool
	IsDiscontinuous bool
	NumDataRecords  int
	DurationSec     float64
	NumSignals      int
}

// Signal is one channel within an EDF file, with all data records decoded.
type Signal struct {
	Label        string
	Transducer   string
	PhysDim      string  // physical unit (e.g. "cmH2O", "L/s", "%")
	PhysMin      float64
	PhysMax      float64
	DigMin       int
	DigMax       int
	Prefiltering string
	NSamples     int       // samples per data record
	Samples      []float64 // all records concatenated, in physical units
}

// SampleRate returns samples per second (Hz), or 0 if duration is unset.
func (s *Signal) SampleRate(durationSec float64) float64 {
	if durationSec == 0 {
		return 0
	}
	return float64(s.NSamples) / durationSec
}
