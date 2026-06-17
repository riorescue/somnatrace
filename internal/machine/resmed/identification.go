// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// DeviceInfo holds the fields extracted from Identification.json.
type DeviceInfo struct {
	SerialNumber string
	ProductCode  string
	ProductName  string
}

type identificationFile struct {
	FlowGenerator struct {
		IdentificationProfiles struct {
			Product struct {
				SerialNumber string `json:"SerialNumber"`
				ProductCode  string `json:"ProductCode"`
				ProductName  string `json:"ProductName"`
			} `json:"Product"`
		} `json:"IdentificationProfiles"`
	} `json:"FlowGenerator"`
}

// ParseIdentificationRaw returns the raw bytes of the identification file for
// storage. Tries Identification.json first, then Identification.tgt. Returns
// nil (no error) if neither file is present.
func ParseIdentificationRaw(root string) ([]byte, error) {
	jsonPath := filepath.Join(root, "Identification.json")
	if data, err := os.ReadFile(jsonPath); err == nil {
		var probe any
		if json.Unmarshal(data, &probe) == nil {
			return data, nil
		}
	}
	tgtPath := filepath.Join(root, "Identification.tgt")
	if data, err := os.ReadFile(tgtPath); err == nil {
		return data, nil
	}
	return nil, nil
}

// ParseIdentification reads device identity from the SD card root.
// It tries Identification.json first (AirSense 10/11), then falls back to
// Identification.tgt (S9 and early AirSense 10 cards).
func ParseIdentification(root string) (*DeviceInfo, error) {
	if info, err := parseIdentificationJSON(root); err == nil {
		return info, nil
	}
	if info, err := parseIdentificationTGT(root); err == nil {
		return info, nil
	}
	return nil, fmt.Errorf("resmed: no readable identification file found at %q", root)
}

func parseIdentificationJSON(root string) (*DeviceInfo, error) {
	data, err := os.ReadFile(filepath.Join(root, "Identification.json"))
	if err != nil {
		return nil, err
	}
	var f identificationFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("resmed: parse Identification.json: %w", err)
	}
	p := f.FlowGenerator.IdentificationProfiles.Product
	if p.SerialNumber == "" {
		return nil, fmt.Errorf("resmed: Identification.json: missing SerialNumber")
	}
	return &DeviceInfo{
		SerialNumber: p.SerialNumber,
		ProductCode:  p.ProductCode,
		ProductName:  p.ProductName,
	}, nil
}

// parseIdentificationTGT parses the older line-delimited key=value identification
// file written by S9 and some early AirSense 10 devices. Lines look like:
//
//	#SerialNumber=12345678
//	#ProductCode=36013
//	#ProductName=S9 AutoSet
//
// The leading '#' is optional and the separator may be '=' or a space.
func parseIdentificationTGT(root string) (*DeviceInfo, error) {
	f, err := os.Open(filepath.Join(root, "Identification.tgt"))
	if err != nil {
		return nil, err
	}
	defer f.Close()

	kv := make(map[string]string)
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		line = strings.TrimPrefix(line, "#")
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Support both '=' and ' ' as separator; prefer first '='.
		if idx := strings.IndexByte(line, '='); idx > 0 {
			kv[strings.TrimSpace(line[:idx])] = strings.TrimSpace(line[idx+1:])
		} else if idx := strings.IndexByte(line, ' '); idx > 0 {
			kv[strings.TrimSpace(line[:idx])] = strings.TrimSpace(line[idx+1:])
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("resmed: read Identification.tgt: %w", err)
	}

	serial := kv["SerialNumber"]
	if serial == "" {
		return nil, fmt.Errorf("resmed: Identification.tgt: missing SerialNumber")
	}
	return &DeviceInfo{
		SerialNumber: serial,
		ProductCode:  kv["ProductCode"],
		ProductName:  kv["ProductName"],
	}, nil
}
