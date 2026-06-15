// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package handlers

import (
	"net/http"

	"github.com/somnatrace/somnatrace/internal/models"
	"github.com/somnatrace/somnatrace/internal/service"
)

// DevicesHandler serves device listing endpoints.
type DevicesHandler struct {
	svc *service.DeviceService
}

// NewDevicesHandler returns a DevicesHandler backed by svc.
func NewDevicesHandler(svc *service.DeviceService) *DevicesHandler {
	return &DevicesHandler{svc: svc}
}

// List handles GET /api/v1/devices and returns all known devices as JSON.
func (h *DevicesHandler) List(w http.ResponseWriter, r *http.Request) {
	devices, err := h.svc.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list devices")
		return
	}
	if devices == nil {
		devices = make([]models.Device, 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": devices})
}
