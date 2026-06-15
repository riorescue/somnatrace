// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package edf

import (
	"bytes"
	"strconv"
	"strings"
)

// Annotation is a single time-stamped event parsed from an EDF+ annotations signal.
type Annotation struct {
	OnsetSec    float64 // seconds from file start time
	DurationSec float64 // event duration in seconds (0 if unspecified)
	Text        string  // annotation text, e.g. "Central Apnea"
}

// ParseAnnotations extracts all non-timekeeping annotations from an EDF+ or EDF+D file.
// It reads the "EDF Annotations" signal and parses each data record's TAL list.
//
// TAL format used by ResMed EVE files (per record):
//
//	Timekeeping: +onset\x14\x14\x00
//	Event:       +onset\x15duration\x14text\x14\x00
func ParseAnnotations(f *File) []Annotation {
	annSig, ok := f.SignalByLabel("EDF Annotations")
	if !ok {
		return nil
	}

	ns := annSig.NSamples
	var result []Annotation

	for rec := 0; rec < f.Header.NumDataRecords; rec++ {
		start := rec * ns
		end := start + ns
		if end > len(annSig.Samples) {
			break
		}
		raw := samplesToBytes(annSig.Samples[start:end])
		result = append(result, parseTALs(raw)...)
	}
	return result
}

// samplesToBytes converts annotation signal samples (stored as little-endian int16 pairs
// in float64 values) back to the original byte stream.
func samplesToBytes(samples []float64) []byte {
	buf := make([]byte, len(samples)*2)
	for i, v := range samples {
		iv := int16(v)
		buf[i*2] = byte(iv & 0xFF)
		buf[i*2+1] = byte((iv >> 8) & 0xFF)
	}
	return buf
}

// parseTALs parses a single EDF+ data record's annotation byte buffer into Annotations.
// Records are split on \x00 (TAL terminator); timekeeping TALs (no \x15) are skipped.
func parseTALs(buf []byte) []Annotation {
	var result []Annotation

	for _, tal := range bytes.Split(buf, []byte{0x00}) {
		if len(tal) == 0 {
			continue
		}
		// Timekeeping TALs contain only \x14 separators, no \x15.
		idx15 := bytes.IndexByte(tal, 0x15)
		if idx15 < 0 {
			continue
		}

		// onset is between the leading '+'/'-' and \x15
		onsetStr := strings.TrimSpace(string(tal[1:idx15]))
		rest := tal[idx15+1:]

		// Split rest on \x14 to get [duration, text, ...]
		parts := bytes.SplitN(rest, []byte{0x14}, 3)
		if len(parts) < 2 {
			continue
		}

		durationStr := strings.TrimSpace(string(parts[0]))
		text := strings.TrimSpace(string(parts[1]))
		if text == "" {
			continue
		}

		onset, err := strconv.ParseFloat(onsetStr, 64)
		if err != nil {
			continue
		}
		duration, _ := strconv.ParseFloat(durationStr, 64)

		result = append(result, Annotation{
			OnsetSec:    onset,
			DurationSec: duration,
			Text:        text,
		})
	}
	return result
}
