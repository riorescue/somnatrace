// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package handlers

import (
	"net/http"

	"github.com/riorescue/somnatrace/internal/models"
	"github.com/riorescue/somnatrace/internal/service"
)

// MasksHandler serves the mask catalog endpoint.
type MasksHandler struct {
	svc *service.MaskService
}

// NewMasksHandler returns a MasksHandler backed by svc.
func NewMasksHandler(svc *service.MaskService) *MasksHandler {
	return &MasksHandler{svc: svc}
}

// List handles GET /api/v1/masks and returns the full mask catalog ordered by
// sort_order.
func (h *MasksHandler) List(w http.ResponseWriter, r *http.Request) {
	masks, err := h.svc.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list masks")
		return
	}
	if masks == nil {
		masks = make([]models.Mask, 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"masks": masks})
}
