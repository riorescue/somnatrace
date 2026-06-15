// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package resmed

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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

// ParseIdentificationRaw reads <root>/Identification.json and returns the raw JSON
// bytes for storage. Returns nil if the file is absent.
func ParseIdentificationRaw(root string) ([]byte, error) {
	data, err := os.ReadFile(filepath.Join(root, "Identification.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var probe any
	if err := json.Unmarshal(data, &probe); err != nil {
		return nil, fmt.Errorf("invalid JSON in Identification.json: %w", err)
	}
	return data, nil
}

// ParseIdentification reads and parses <root>/Identification.json.
func ParseIdentification(root string) (*DeviceInfo, error) {
	path := filepath.Join(root, "Identification.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("resmed: read Identification.json: %w", err)
	}

	var f identificationFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, fmt.Errorf("resmed: parse Identification.json: %w", err)
	}

	p := f.FlowGenerator.IdentificationProfiles.Product
	return &DeviceInfo{
		SerialNumber: p.SerialNumber,
		ProductCode:  p.ProductCode,
		ProductName:  p.ProductName,
	}, nil
}
