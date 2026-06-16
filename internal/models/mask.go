// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package models

// MaskType classifies CPAP/BiPAP masks by their interface style.
type MaskType string

const (
	MaskTypeFullFace   MaskType = "full_face"
	MaskTypeNasal      MaskType = "nasal"
	MaskTypeNasalPillow MaskType = "nasal_pillow"
	MaskTypeOralNasal  MaskType = "oral_nasal"
)

// Mask represents a single CPAP/BiPAP mask model in the catalog.
type Mask struct {
	ID           string   `json:"id"`
	Manufacturer string   `json:"manufacturer"`
	Name         string   `json:"name"`
	MaskType     MaskType `json:"mask_type"`
	IsCatchall   bool     `json:"is_catchall"`
	SortOrder    int      `json:"sort_order"`
}
