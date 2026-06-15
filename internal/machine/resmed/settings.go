// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ParseDeviceSettings reads the full SETTINGS/CurrentSettings.json and returns
// it as a raw JSON byte slice for storage. Returns nil if the file is absent.
func ParseDeviceSettings(root string) ([]byte, error) {
	data, err := os.ReadFile(filepath.Join(root, "SETTINGS", "CurrentSettings.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	// Validate it's parseable JSON before returning.
	var probe any
	if err := json.Unmarshal(data, &probe); err != nil {
		return nil, fmt.Errorf("invalid JSON in CurrentSettings.json: %w", err)
	}
	return data, nil
}

// ParseDeviceTimezone reads the machine-configured UTC offset from
// SETTINGS/CurrentSettings.json and returns the corresponding fixed-zone Location.
// Falls back to time.Local if the file is missing or unparseable.
func ParseDeviceTimezone(root string) (*time.Location, error) {
	data, err := os.ReadFile(filepath.Join(root, "SETTINGS", "CurrentSettings.json"))
	if err != nil {
		return time.Local, nil
	}

	var doc struct {
		FlowGenerator struct {
			SettingProfiles struct {
				FeatureProfiles struct {
					TimeZoneFeature struct {
						TimeZoneOffset string `json:"TimeZoneOffset"`
					} `json:"TimeZoneFeature"`
				} `json:"FeatureProfiles"`
			} `json:"SettingProfiles"`
		} `json:"FlowGenerator"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return time.Local, nil
	}

	raw := doc.FlowGenerator.SettingProfiles.FeatureProfiles.TimeZoneFeature.TimeZoneOffset
	if raw == "" {
		return time.Local, nil
	}
	return parseTZOffset(raw)
}

// parseTZOffset converts a string like "-08:00" or "+05:30" to a fixed-zone Location.
func parseTZOffset(s string) (*time.Location, error) {
	sign := 1
	if len(s) == 0 {
		return nil, fmt.Errorf("empty offset")
	}
	switch s[0] {
	case '-':
		sign = -1
		s = s[1:]
	case '+':
		s = s[1:]
	}
	parts := strings.SplitN(s, ":", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid offset format %q", s)
	}
	hours, err := strconv.Atoi(parts[0])
	if err != nil {
		return nil, fmt.Errorf("bad hours in offset: %w", err)
	}
	mins, err := strconv.Atoi(parts[1])
	if err != nil {
		return nil, fmt.Errorf("bad minutes in offset: %w", err)
	}
	offsetSec := sign * (hours*3600 + mins*60)
	return time.FixedZone("ResMedLocal", offsetSec), nil
}
