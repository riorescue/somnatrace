// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/somnatrace/somnatrace/internal/service"
)

// RulesHandler serves the clinical rules catalog and enable/disable endpoints.
type RulesHandler struct {
	svc *service.RulesService
}

// NewRulesHandler returns a RulesHandler backed by svc.
func NewRulesHandler(svc *service.RulesService) *RulesHandler {
	return &RulesHandler{svc: svc}
}

// List handles GET /api/v1/rules and returns all built-in rules with their
// current enabled/disabled status.
func (h *RulesHandler) List(w http.ResponseWriter, r *http.Request) {
	rules, err := h.svc.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list rules")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rules": rules})
}

// SetEnabled handles PATCH /api/v1/rules/{id} and toggles a rule on or off.
func (h *RulesHandler) SetEnabled(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing rule id")
		return
	}

	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.SetEnabled(id, body.Enabled); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update rule")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": body.Enabled})
}
