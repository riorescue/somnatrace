// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package service

import (
	"fmt"

	"github.com/somnatrace/somnatrace/internal/db"
	"github.com/somnatrace/somnatrace/internal/models"
)

// MaskService provides read access to the mask catalog.
type MaskService struct {
	db *db.DB
}

// List returns all masks ordered by sort_order ascending.
func (s *MaskService) List() ([]models.Mask, error) {
	rows, err := s.db.Query(`
		SELECT id, manufacturer, name, mask_type, is_catchall, sort_order
		FROM masks
		ORDER BY sort_order ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list masks: %w", err)
	}
	defer rows.Close()

	var masks []models.Mask
	for rows.Next() {
		var m models.Mask
		var isCatchall int
		if err := rows.Scan(&m.ID, &m.Manufacturer, &m.Name, &m.MaskType, &isCatchall, &m.SortOrder); err != nil {
			return nil, fmt.Errorf("scan mask: %w", err)
		}
		m.IsCatchall = isCatchall != 0
		masks = append(masks, m)
	}
	return masks, rows.Err()
}
