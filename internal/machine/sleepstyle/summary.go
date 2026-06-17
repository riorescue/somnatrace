// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package sleepstyle parses Fisher & Paykel SleepStyle CPAP SD cards.
//
// SD card layout:
//   FPHCARE/
//     ICON/
//       <serial>/            ← device directory
//         SUM*.FPH           ← nightly summary (512-byte text header + binary records)
//         REALTIME/
//           HRD*.EDF         ← waveform EDF files (flow, pressure, leak)
package sleepstyle

import (
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// DeviceInfo holds the identification fields parsed from a SUM*.FPH header.
type DeviceInfo struct {
	SerialNumber string
	ModelNumber  string
	IsCPAP       bool // false = Auto (APAP)
}

// NightRecord holds the parsed per-night summary record from a SUM*.FPH file.
type NightRecord struct {
	StartTime    time.Time
	UseTimeSec   int    // mask-on time in seconds
	RunTimeSec   int    // total device-on time in seconds
	MinPressure  float64 // cmH2O
	P95Pressure  float64 // cmH2O
	MaxPressure  float64 // cmH2O
	CPAPPressSet float64 // cmH2O (for CPAP mode)
	MinPressSet  float64 // cmH2O (for APAP mode)
	MaxPressSet  float64 // cmH2O (for APAP mode)
	IsAPAP       bool
}

// FindDeviceDirs returns the per-device directories within FPHCARE/ICON/<serial>.
func FindDeviceDirs(root string) ([]string, error) {
	iconDir := filepath.Join(root, "FPHCARE", "ICON")
	entries, err := os.ReadDir(iconDir)
	if err != nil {
		return nil, fmt.Errorf("sleepstyle: read ICON dir %s: %w", iconDir, err)
	}
	var dirs []string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(iconDir, e.Name())
		if hasSumFPH(dir) {
			dirs = append(dirs, dir)
		}
	}
	if len(dirs) == 0 {
		return nil, fmt.Errorf("sleepstyle: no device directories found under %s", iconDir)
	}
	return dirs, nil
}

// hasSumFPH reports whether dir contains at least one SUM*.FPH file.
func hasSumFPH(dir string) bool {
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		name := strings.ToUpper(e.Name())
		if strings.HasPrefix(name, "SUM") && strings.HasSuffix(name, ".FPH") {
			return true
		}
	}
	return false
}

// ParseSumFile parses a single SUM*.FPH file and returns device identification
// information and all nightly records it contains.
func ParseSumFile(path string) (*DeviceInfo, []NightRecord, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, fmt.Errorf("sleepstyle: read %s: %w", path, err)
	}
	if len(data) < 512 {
		return nil, nil, fmt.Errorf("sleepstyle: %s too short (%d bytes)", path, len(data))
	}

	// ── 512-byte text header ──────────────────────────────────────────
	hdrRaw := data[:512]
	// Header is space-delimited, terminated by ';' at offset 0x1FF.
	if hdrRaw[511] != ';' {
		return nil, nil, fmt.Errorf("sleepstyle: %s missing header terminator", path)
	}
	hdrText := strings.TrimRight(string(hdrRaw[:511]), "\x00 \t\r\n")
	fields := strings.Fields(hdrText)

	// fields[0]=h1, [1]=version, [2]=filename, [3]=serial, [4]=model, [5]=type, [6]=unknownident
	if len(fields) < 6 {
		return nil, nil, fmt.Errorf("sleepstyle: %s header has too few fields (%d)", path, len(fields))
	}

	// The 5th line (0-indexed field [4]) must equal "SLEEPSTYLE" to confirm device type.
	if !strings.EqualFold(fields[4], "SLEEPSTYLE") {
		return nil, nil, fmt.Errorf("sleepstyle: %s is not a SleepStyle SUM file (field 5=%q)", path, fields[4])
	}

	typeField := ""
	if len(fields) >= 6 {
		typeField = fields[5]
	}
	info := &DeviceInfo{
		SerialNumber: fields[3],
		ModelNumber:  fields[4],
		IsCPAP:       len(typeField) >= 4 && typeField[3] == 'C',
	}

	// ── Binary session records (40 bytes each) ─────────────────────────
	records, err := parseBinaryRecords(data[512:])
	if err != nil {
		return info, nil, fmt.Errorf("sleepstyle: parse records in %s: %w", path, err)
	}

	return info, records, nil
}

// parseBinaryRecords parses the binary portion of a SUM*.FPH file (after the
// 512-byte text header). Each record is exactly 40 bytes (little-endian).
func parseBinaryRecords(data []byte) ([]NightRecord, error) {
	const recordSize = 40
	var records []NightRecord

	for len(data) >= recordSize {
		r := data[:recordSize]
		data = data[recordSize:]

		ts := binary.LittleEndian.Uint32(r[0:4])

		// Terminator sentinel: ts == 0xFFFFFFFF or low 16 bits == 0xFAFE.
		if ts == 0xFFFFFFFF || (ts&0xFFFF) == 0xFAFE {
			break
		}

		startTime := convertFPTimestamp(ts)

		runTime := int(r[4])
		useTime := int(r[5]) // × 360 seconds

		minPressSeen := float64(r[6]) / 10.0
		pct95PressSeen := float64(r[7]) / 10.0
		maxPressSeen := float64(r[8]) / 10.0

		// Bytes 9–14: unknown
		// Bytes 15–22: four uint16 values (c1..c4) — skip for now
		// Byte 23–27: j1, mode, ramp, x1, x2
		// Byte 28: CPAPpressSet / 10
		// Byte 29: minPressSet / 10
		// Byte 30: maxPressSet / 10

		cpapPressSet := float64(r[28]) / 10.0
		minPressSet := float64(r[29]) / 10.0
		maxPressSet := float64(r[30]) / 10.0

		// Determine if this night was APAP or CPAP:
		// if maxPressSeen == CPAPpressSet && pct95PressSeen == CPAPpressSet → fixed CPAP
		isAPAP := !(math.Abs(maxPressSeen-cpapPressSet) < 0.05 && math.Abs(pct95PressSeen-cpapPressSet) < 0.05)

		nr := NightRecord{
			StartTime:    startTime,
			UseTimeSec:   useTime * 360,
			RunTimeSec:   runTime * 360,
			MinPressure:  minPressSeen,
			P95Pressure:  pct95PressSeen,
			MaxPressure:  maxPressSeen,
			CPAPPressSet: cpapPressSet,
			MinPressSet:  minPressSet,
			MaxPressSet:  maxPressSet,
			IsAPAP:       isAPAP,
		}
		records = append(records, nr)
	}

	return records, nil
}

// convertFPTimestamp decodes a Fisher & Paykel packed timestamp.
// Bit layout: [4:0]=day, [8:5]=month, [14:9]=year-2000, [20:15]=sec, [26:21]=min, [31:27]=hour
// The result is adjusted by -54 seconds to match local device time vs UTC.
func convertFPTimestamp(ts uint32) time.Time {
	day := int(ts & 0x1f)
	month := int((ts >> 5) & 0x0f)
	year := 2000 + int((ts>>9)&0x3f)
	ts2 := ts >> 15
	second := int(ts2 & 0x3f)
	minute := int((ts2 >> 6) & 0x3f)
	hour := int(ts2 >> 12)

	t := time.Date(year, time.Month(month), day, hour, minute, second, 0, time.UTC)
	return t.Add(-54 * time.Second)
}

// LoadDeviceNights loads all nightly records from all SUM*.FPH files in a
// device directory, returning merged device info and sorted records.
func LoadDeviceNights(deviceDir string) (*DeviceInfo, []NightRecord, error) {
	entries, err := os.ReadDir(deviceDir)
	if err != nil {
		return nil, nil, fmt.Errorf("sleepstyle: read device dir: %w", err)
	}

	var sumPaths []string
	for _, e := range entries {
		name := strings.ToUpper(e.Name())
		if strings.HasPrefix(name, "SUM") && strings.HasSuffix(name, ".FPH") {
			sumPaths = append(sumPaths, filepath.Join(deviceDir, e.Name()))
		}
	}
	sort.Strings(sumPaths)

	var info *DeviceInfo
	var allRecords []NightRecord

	for _, p := range sumPaths {
		di, recs, err := ParseSumFile(p)
		if err != nil {
			continue // skip corrupt files
		}
		if info == nil {
			info = di
		}
		allRecords = append(allRecords, recs...)
	}

	if info == nil {
		return nil, nil, fmt.Errorf("sleepstyle: no valid SUM files in %s", deviceDir)
	}

	sort.Slice(allRecords, func(i, j int) bool {
		return allRecords[i].StartTime.Before(allRecords[j].StartTime)
	})

	// Deduplicate records with the same start time.
	allRecords = deduplicateRecords(allRecords)

	return info, allRecords, nil
}

func deduplicateRecords(records []NightRecord) []NightRecord {
	if len(records) == 0 {
		return records
	}
	out := []NightRecord{records[0]}
	for _, r := range records[1:] {
		if !r.StartTime.Equal(out[len(out)-1].StartTime) {
			out = append(out, r)
		}
	}
	return out
}
