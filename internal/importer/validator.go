package importer

import (
	"errors"
	"os"
	"path/filepath"
)

// Validate performs a lightweight pre-flight check on a Source before the full
// import pipeline runs. It returns a list of non-fatal warnings (e.g. missing
// optional files) and a fatal error only if the source cannot be used at all.
func Validate(src Source) (warnings []string, err error) {
	if src.Type != SourceTypeDirectory {
		// ZIP validation is deferred; nothing to check yet.
		return nil, nil
	}

	entries, err := os.ReadDir(src.Path)
	if err != nil {
		return nil, err
	}

	if len(entries) == 0 {
		return nil, errors.New("validator: source directory is empty")
	}

	hasDataDir := false
	for _, e := range entries {
		if e.IsDir() {
			switch e.Name() {
			case "DATALOG", "STR.edf", "Identification.tgt":
				hasDataDir = true
			}
		}
		if filepath.Ext(e.Name()) == ".edf" || filepath.Ext(e.Name()) == ".tgt" {
			hasDataDir = true
		}
	}

	if !hasDataDir {
		warnings = append(warnings, "no recognized device data files found; import may produce no sessions")
	}

	return warnings, nil
}
