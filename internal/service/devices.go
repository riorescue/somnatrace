// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package service

import (
	"fmt"

	"github.com/somnatrace/somnatrace/internal/db"
	"github.com/somnatrace/somnatrace/internal/models"
)

// DeviceService provides read access to the devices table.
type DeviceService struct {
	db *db.DB
}

// List returns all known devices ordered by most recently seen first.
func (s *DeviceService) List() ([]models.Device, error) {
	rows, err := s.db.Query(`
		SELECT id, family, manufacturer, model, serial_number,
		       first_seen, last_seen, created_at
		FROM devices
		ORDER BY last_seen DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("list devices: %w", err)
	}
	defer rows.Close()

	var devices []models.Device
	for rows.Next() {
		var d models.Device
		if err := rows.Scan(
			&d.ID, &d.Family, &d.Manufacturer, &d.Model, &d.SerialNumber,
			&d.FirstSeen, &d.LastSeen, &d.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan device: %w", err)
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}
