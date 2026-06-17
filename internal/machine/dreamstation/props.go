// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package dreamstation

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// DeviceInfo holds the identification fields read from a DreamStation
// properties file.
type DeviceInfo struct {
	SerialNumber  string
	ModelNumber   string
	Family        int
	FamilyVersion int
	ProductName   string // human-readable name derived from ModelNumber
	IsDS2         bool   // true if identified via PROP.BIN (DreamStation 2)
}

// shortToLong maps the abbreviated key names used in PROP.TXT to their
// canonical long forms.
var shortToLong = map[string]string{
	"SN":  "SerialNumber",
	"MN":  "ModelNumber",
	"F":   "Family",
	"FV":  "FamilyVersion",
	"DFV": "DataFormatVersion",
	"SV":  "SoftwareVersion",
	"FD":  "FirstDate",
	"LD":  "LastDate",
	"BK":  "BasicKey",
	"DK":  "DetailsKey",
	"EK":  "ErrorKey",
	"FN":  "PatientFolderNum",
	"PFN": "PatientFileNum",
	"EFN": "EquipFileNum",
	"DFN": "DFileNum",
	"VC":  "ValidCheck",
}

// ParseProps reads the device properties from a DreamStation SD card
// device directory and returns the parsed DeviceInfo. It tries
// properties.txt, then PROP.TXT, then reports an error.
func ParseProps(deviceDir string) (*DeviceInfo, error) {
	for _, name := range []string{"properties.txt", "PROP.TXT"} {
		path := filepath.Join(deviceDir, name)
		if _, err := os.Stat(path); err == nil {
			return parsePropsTXT(path, false)
		}
	}
	// Check for case-insensitive match (PROP.TXT on case-sensitive FS).
	entries, err := os.ReadDir(deviceDir)
	if err != nil {
		return nil, fmt.Errorf("dreamstation: read device dir %s: %w", deviceDir, err)
	}
	for _, e := range entries {
		upper := strings.ToUpper(e.Name())
		if upper == "PROP.TXT" || upper == "PROPERTIES.TXT" {
			return parsePropsTXT(filepath.Join(deviceDir, e.Name()), false)
		}
	}
	return nil, fmt.Errorf("dreamstation: no properties file found in %s", deviceDir)
}

func parsePropsTXT(path string, isDS2 bool) (*DeviceInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("dreamstation: open %s: %w", path, err)
	}
	defer f.Close()

	kv := make(map[string]string)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		if long, ok := shortToLong[key]; ok {
			key = long
		}
		// Remap Family text values to integers.
		if key == "Family" {
			switch val {
			case "xPAP":
				val = "0"
			case "Ventilator":
				val = "3"
			}
		}
		kv[key] = val
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("dreamstation: scan %s: %w", path, err)
	}

	info := &DeviceInfo{
		SerialNumber: kv["SerialNumber"],
		ModelNumber:  kv["ModelNumber"],
		IsDS2:        isDS2,
	}
	if info.SerialNumber == "" {
		return nil, fmt.Errorf("dreamstation: missing SerialNumber in %s", path)
	}
	info.Family = atoi(kv["Family"])
	info.FamilyVersion = atoi(kv["FamilyVersion"])
	info.ProductName = modelName(info.ModelNumber)
	return info, nil
}

// atoi parses s as a decimal integer and returns 0 on error.
func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// modelName returns a human-readable product name for a DreamStation model
// number, or the model number itself if unknown.
func modelName(model string) string {
	names := map[string]string{
		"500X110": "DreamStation Auto CPAP",
		"500X120": "DreamStation Auto CPAP",
		"500X130": "DreamStation Auto CPAP",
		"500X140": "DreamStation Auto CPAP with A-Flex",
		"500X150": "DreamStation Auto CPAP",
		"500X180": "DreamStation Auto CPAP",
		"400X110": "DreamStation CPAP Pro",
		"400X120": "DreamStation CPAP Pro",
		"400X130": "DreamStation CPAP Pro",
		"400X150": "DreamStation CPAP Pro",
		"200X110": "DreamStation CPAP",
		"400G110": "DreamStation Go",
		"500G110": "DreamStation Go Auto",
		"500G120": "DreamStation Go Auto",
		"500G150": "DreamStation Go Auto",
		"600X110": "DreamStation BiPAP Pro",
		"700X110": "DreamStation Auto BiPAP",
		"700X120": "DreamStation Auto BiPAP",
		"900X110": "DreamStation BiPAP autoSV",
		"410X150C": "DreamStation 2 CPAP",
		"420X150C": "DreamStation 2 Advanced CPAP",
		"520X110C": "DreamStation 2 Auto CPAP Advanced",
		"520X130C": "DreamStation 2 Auto CPAP Advanced",
		"520X150C": "DreamStation 2 Auto CPAP Advanced",
	}
	if name, ok := names[model]; ok {
		return name
	}
	if model != "" {
		return "DreamStation " + model
	}
	return "DreamStation"
}

// FindDeviceDirs returns all device directories within the P-Series folder
// at root, each containing a properties file. Directories are returned in
// alphabetical order (oldest first on most devices).
func FindDeviceDirs(root string) ([]string, error) {
	pseriesPath := ""
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, fmt.Errorf("dreamstation: read root %s: %w", root, err)
	}
	for _, e := range entries {
		if e.IsDir() && strings.EqualFold(e.Name(), "P-Series") {
			pseriesPath = filepath.Join(root, e.Name())
			break
		}
	}
	if pseriesPath == "" {
		return nil, fmt.Errorf("dreamstation: P-Series directory not found in %s", root)
	}

	subs, err := os.ReadDir(pseriesPath)
	if err != nil {
		return nil, fmt.Errorf("dreamstation: read P-Series dir: %w", err)
	}

	var dirs []string
	for _, s := range subs {
		if !s.IsDir() {
			continue
		}
		dir := filepath.Join(pseriesPath, s.Name())
		if hasPropFile(dir) {
			dirs = append(dirs, dir)
		}
	}
	return dirs, nil
}

// hasPropFile reports whether dir contains a DreamStation properties file.
func hasPropFile(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		switch strings.ToUpper(e.Name()) {
		case "PROP.TXT", "PROPERTIES.TXT", "PROP.BIN":
			return true
		}
	}
	return false
}

// IsDS2DeviceDir returns true when dir looks like a DreamStation 2 device
// directory (contains PROP.BIN but not PROP.TXT).
func IsDS2DeviceDir(dir string) bool {
	entries, _ := os.ReadDir(dir)
	hasBin, hasTxt := false, false
	for _, e := range entries {
		switch strings.ToUpper(e.Name()) {
		case "PROP.BIN":
			hasBin = true
		case "PROP.TXT", "PROPERTIES.TXT":
			hasTxt = true
		}
	}
	return hasBin && !hasTxt
}
