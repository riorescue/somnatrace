// Package resmed contains all ResMed AirSense/AirCurve-specific parsing logic:
// SD card layout constants, session file discovery, STR.edf decoding, EDF+D
// event annotation parsing, device settings and identification extraction.
package resmed

// Well-known file and directory names within a ResMed SD-card export.
const (
	DirDatalog         = "DATALOG"           // directory containing per-session EDF files
	FileSTR            = "STR.edf"           // device-generated daily therapy summary
	FileIdentification = "Identification.tgt"
	FileSettings       = "SETTINGS"          // directory containing CurrentSettings.json

	// DatalogPattern matches per-session EDF filenames: YYYYMMDD_HHMMSS_<type>.edf
	DatalogPattern = "????????_??????_*.edf"
)

// SignalLabels maps SomnaTrace signal names to the EDF label prefixes used by
// AirSense devices. Labels in EDF files are matched case-insensitively with
// HasPrefix, so this map is informational rather than used at runtime.
var SignalLabels = map[string]string{
	"Flow":       "Flow",
	"Leak":       "Leak",
	"Pressure":   "Mask Pres",
	"AHI":        "AHI",
	"EventFlags": "Evt Flags",
}
