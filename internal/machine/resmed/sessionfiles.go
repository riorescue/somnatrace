// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/riorescue/somnatrace/internal/edf"
)

// SessionBundle groups EDF files belonging to one continuous therapy segment.
// A single calendar-day folder may contain multiple bundles when the user
// removed and reapplied the mask during the night.
type SessionBundle struct {
	Date      time.Time // calendar date of the session (from folder name)
	FolderDir string

	// Parsed EDF files — only non-nil if present on the card.
	BRP *edf.File // 25 Hz flow + pressure waveforms
	PLD *edf.File // 2-second derived stats (pressure, leak, resp rate…)
	SA2 *edf.File // 1 Hz SpO2 + pulse
	CSL *edf.File // EDF+D Cheyne-Stokes annotation events
	EVE *edf.File // EDF+D scored respiratory event annotations
}

// StartTime returns the EDF-recorded start time of the primary data file (PLD > BRP > SA2).
func (s *SessionBundle) StartTime() time.Time {
	for _, f := range []*edf.File{s.PLD, s.BRP, s.SA2} {
		if f != nil {
			return f.Header.StartTime
		}
	}
	return time.Time{}
}

// EndTime returns start + duration based on the primary file's record count.
func (s *SessionBundle) EndTime() time.Time {
	for _, f := range []*edf.File{s.PLD, s.BRP, s.SA2} {
		if f != nil {
			dur := time.Duration(float64(f.Header.NumDataRecords) * f.Header.DurationSec * float64(time.Second))
			return f.Header.StartTime.Add(dur)
		}
	}
	return time.Time{}
}

// DiscoverSessions walks the DATALOG directory and returns all session bundles
// across all date subdirectories. A single date folder may yield multiple
// bundles when the device records separate therapy segments in one night.
// loc is used to interpret EDF header timestamps and repair corrupt ones.
func DiscoverSessions(root string, loc *time.Location) ([]SessionBundle, error) {
	datalogsDir := filepath.Join(root, "DATALOG")
	entries, err := os.ReadDir(datalogsDir)
	if err != nil {
		return nil, fmt.Errorf("resmed: read DATALOG: %w", err)
	}

	var all []SessionBundle
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		date, err := time.ParseInLocation("20060102", entry.Name(), loc)
		if err != nil {
			continue
		}
		bundles, err := discoverBundlesInDir(filepath.Join(datalogsDir, entry.Name()), date, loc)
		if err != nil {
			return nil, fmt.Errorf("resmed: load sessions %s: %w", entry.Name(), err)
		}
		all = append(all, bundles...)
	}
	return all, nil
}

// annotationMatchWindow is how far apart an EVE/CSL file's timestamp may be
// from the nearest data file (BRP/PLD/SA2) and still be considered the same
// therapy segment. ResMed firmware creates annotation files a few seconds
// before the waveform files in the same session, so a short window is enough.
const annotationMatchWindow = 5 * time.Minute

// brpMatchWindow is how far apart a BRP-only group's filename timestamp may be
// from a PLD-bearing group and still be merged into it. ResMed firmware
// sometimes writes the 25 Hz BRP waveform file 1-2 seconds after the PLD/SA2
// files for the same session, producing two filename prefixes that the initial
// grouping splits into separate bundles. This window keeps the merge narrow so
// genuinely distinct mask-off/mask-on segments are not accidentally combined.
const brpMatchWindow = 2 * time.Minute

// discoverBundlesInDir scans a single DATALOG/YYYYMMDD directory and returns
// one SessionBundle per distinct therapy segment. Each EDF file's header start
// time is validated against the filename-encoded time and repaired when the two
// differ by more than 6 hours, which can happen due to a known ResMed firmware
// bug that corrupts the ASCII date field in EDF headers.
//
// ResMed firmware assigns EVE/CSL annotation files a timestamp a few seconds
// earlier than the corresponding BRP/PLD/SA2 waveform files for the same
// segment. After the initial grouping by exact timestamp prefix, any group that
// contains only annotation files is reassigned to the nearest data group within
// annotationMatchWindow so that events are correctly associated with sessions.
func discoverBundlesInDir(dir string, date time.Time, loc *time.Location) ([]SessionBundle, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	// Group file entries by their YYYYMMDD_HHMMSS timestamp prefix.
	type fileEntry struct {
		name     string
		suffix   string // BRP / PLD / SA2 / CSL / EVE
		fileTime time.Time
	}
	groups := make(map[string][]fileEntry)
	groupTime := make(map[string]time.Time) // prefix → parsed time
	var order []string                      // preserve insertion order for deterministic output

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToUpper(e.Name()), ".EDF") {
			continue
		}
		prefix, suffix, ok := parseEDFFilename(e.Name())
		if !ok {
			continue
		}
		ft, err := time.ParseInLocation("20060102_150405", prefix, loc)
		if err != nil {
			continue
		}
		if _, seen := groups[prefix]; !seen {
			order = append(order, prefix)
			groupTime[prefix] = ft
		}
		groups[prefix] = append(groups[prefix], fileEntry{
			name:     e.Name(),
			suffix:   suffix,
			fileTime: ft,
		})
	}

	// Separate prefixes into those that own data files (BRP/PLD/SA2) and those
	// that contain only annotation files (EVE/CSL). The latter are merged into
	// the nearest data group to compensate for the firmware timestamp offset.
	isDataSuffix := func(s string) bool {
		return s == "BRP" || s == "PLD" || s == "SA2"
	}
	hasData := func(prefix string) bool {
		for _, fe := range groups[prefix] {
			if isDataSuffix(fe.suffix) {
				return true
			}
		}
		return false
	}

	var annotOnlyPrefixes []string
	var filteredOrder []string
	for _, p := range order {
		if hasData(p) {
			filteredOrder = append(filteredOrder, p)
		} else {
			annotOnlyPrefixes = append(annotOnlyPrefixes, p)
		}
	}

	for _, ap := range annotOnlyPrefixes {
		at := groupTime[ap]
		bestPrefix := ""
		bestDiff := time.Duration(1<<63 - 1)
		for _, dp := range filteredOrder {
			diff := at.Sub(groupTime[dp])
			if diff < 0 {
				diff = -diff
			}
			if diff < bestDiff {
				bestDiff = diff
				bestPrefix = dp
			}
		}
		if bestPrefix != "" && bestDiff <= annotationMatchWindow {
			groups[bestPrefix] = append(groups[bestPrefix], groups[ap]...)
		}
		delete(groups, ap)
	}

	// Second pass: merge BRP-only data groups into the nearest PLD-bearing group.
	// ResMed firmware sometimes writes BRP 1-2 seconds after PLD/SA2, creating a
	// separate filename prefix that the initial grouping treats as a distinct session.
	hasPLD := func(prefix string) bool {
		for _, fe := range groups[prefix] {
			if fe.suffix == "PLD" || fe.suffix == "SA2" {
				return true
			}
		}
		return false
	}
	isBRPOnly := func(prefix string) bool {
		hasBRP := false
		for _, fe := range groups[prefix] {
			switch fe.suffix {
			case "BRP":
				hasBRP = true
			case "PLD", "SA2":
				return false
			}
		}
		return hasBRP
	}

	var brpOnlyPrefixes []string
	var mergedOrder []string
	for _, p := range filteredOrder {
		if isBRPOnly(p) {
			brpOnlyPrefixes = append(brpOnlyPrefixes, p)
		} else {
			mergedOrder = append(mergedOrder, p)
		}
	}
	for _, bp := range brpOnlyPrefixes {
		bt := groupTime[bp]
		bestPrefix := ""
		bestDiff := time.Duration(1<<63 - 1)
		for _, dp := range mergedOrder {
			if !hasPLD(dp) {
				continue
			}
			diff := bt.Sub(groupTime[dp])
			if diff < 0 {
				diff = -diff
			}
			if diff < bestDiff {
				bestDiff = diff
				bestPrefix = dp
			}
		}
		if bestPrefix != "" && bestDiff <= brpMatchWindow {
			groups[bestPrefix] = append(groups[bestPrefix], groups[bp]...)
		} else {
			mergedOrder = append(mergedOrder, bp)
		}
		delete(groups, bp)
	}
	filteredOrder = mergedOrder

	order = filteredOrder

	var bundles []SessionBundle
	for _, prefix := range order {
		files := groups[prefix]
		sb := SessionBundle{Date: date, FolderDir: dir}

		for _, fe := range files {
			path := filepath.Join(dir, fe.name)
			f, err := edf.ReadFile(path, loc)
			if err != nil {
				continue
			}
			repairEDFTimestamp(f, fe.fileTime)

			switch fe.suffix {
			case "BRP":
				sb.BRP = f
			case "PLD":
				sb.PLD = f
			case "SA2":
				sb.SA2 = f
			case "CSL":
				sb.CSL = f
			case "EVE":
				sb.EVE = f
			}
		}
		bundles = append(bundles, sb)
	}
	return bundles, nil
}

// repairEDFTimestamp corrects f.Header.StartTime when it disagrees with the
// filename-derived fileTime by more than 6 hours. This handles the ResMed
// firmware bug where the ASCII datetime field in the EDF header is corrupted
// while the record count and duration bytes (in different header offsets) survive
// intact. The filename encodes the same RTC value at write time and is reliable.
func repairEDFTimestamp(f *edf.File, fileTime time.Time) {
	if fileTime.IsZero() {
		return
	}
	diff := f.Header.StartTime.Sub(fileTime)
	if diff < 0 {
		diff = -diff
	}
	if diff > 6*time.Hour {
		f.Header.StartTime = fileTime
	}
}

// parseEDFFilename extracts the timestamp prefix and type suffix from a ResMed
// EDF filename of the form "YYYYMMDD_HHMMSS_<TYPE>.edf".
// Returns ("", "", false) for any filename that does not match this pattern.
func parseEDFFilename(name string) (prefix, suffix string, ok bool) {
	upper := strings.ToUpper(name)
	base := strings.TrimSuffix(upper, ".EDF")
	parts := strings.Split(base, "_")
	if len(parts) < 3 {
		return "", "", false
	}
	return parts[0] + "_" + parts[1], parts[len(parts)-1], true
}
