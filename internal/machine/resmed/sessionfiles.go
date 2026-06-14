package resmed

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/somnatrace/somnatrace/internal/edf"
)

// SessionBundle groups EDF files belonging to one therapy session.
type SessionBundle struct {
	Date      time.Time // local date of the session (from folder name)
	FolderDir string

	// Parsed EDF files — only non-nil if present on the card.
	BRP *edf.File // 25 Hz flow + pressure waveforms
	PLD *edf.File // 2-second derived stats (pressure, leak, resp rate…)
	SA2 *edf.File // 1 Hz SpO2 + pulse
	CSL *edf.File // EDF+D clinical summary annotations
	EVE *edf.File // EDF+D event annotations
}

// StartTime returns the EDF-recorded start time of the primary data file (PLD > BRP > SA2).
// The returned time is already in local timezone (as parsed from the EDF header).
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
			dur := time.Duration(float64(f.Header.NumDataRecords)*f.Header.DurationSec*float64(time.Second))
			return f.Header.StartTime.Add(dur)
		}
	}
	return time.Time{}
}

// DiscoverSessions walks the DATALOG directory and returns all session bundles.
// loc is used to parse EDF timestamps.
func DiscoverSessions(root string, loc *time.Location) ([]SessionBundle, error) {
	datalogsDir := filepath.Join(root, "DATALOG")
	entries, err := os.ReadDir(datalogsDir)
	if err != nil {
		return nil, fmt.Errorf("resmed: read DATALOG: %w", err)
	}

	var bundles []SessionBundle
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		// Folder name is YYYYMMDD
		date, err := time.ParseInLocation("20060102", entry.Name(), loc)
		if err != nil {
			continue
		}

		bundle, err := loadSessionBundle(filepath.Join(datalogsDir, entry.Name()), date, loc)
		if err != nil {
			return nil, fmt.Errorf("resmed: load session %s: %w", entry.Name(), err)
		}
		bundles = append(bundles, bundle)
	}
	return bundles, nil
}

func loadSessionBundle(dir string, date time.Time, loc *time.Location) (SessionBundle, error) {
	sb := SessionBundle{Date: date, FolderDir: dir}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return sb, err
	}

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(strings.ToUpper(e.Name()), ".EDF") {
			continue
		}
		name := strings.ToUpper(e.Name())
		path := filepath.Join(dir, e.Name())

		suffix := sessionFileSuffix(name)
		f, err := edf.ReadFile(path, loc)
		if err != nil {
			return sb, fmt.Errorf("read %s: %w", e.Name(), err)
		}

		switch suffix {
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
	return sb, nil
}

// sessionFileSuffix extracts the 3-character type suffix from a filename like "20260612_161010_BRP.edf".
func sessionFileSuffix(name string) string {
	base := strings.TrimSuffix(name, ".EDF")
	parts := strings.Split(base, "_")
	if len(parts) < 3 {
		return ""
	}
	return parts[len(parts)-1]
}
