// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/somnatrace/somnatrace/internal/service"
)

// AppSettingsHandler serves application-level configuration endpoints.
type AppSettingsHandler struct {
	svc *service.AppSettingsService
}

// NewAppSettingsHandler returns an AppSettingsHandler backed by svc.
func NewAppSettingsHandler(svc *service.AppSettingsService) *AppSettingsHandler {
	return &AppSettingsHandler{svc: svc}
}

// Get handles GET /api/v1/settings and returns the current application settings
// plus any computed fields (first_session_date).
func (h *AppSettingsHandler) Get(w http.ResponseWriter, r *http.Request) {
	settings, err := h.svc.Get()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read settings")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// Patch handles PATCH /api/v1/settings. Only fields present in the request
// body are updated; omitted fields are left unchanged.
func (h *AppSettingsHandler) Patch(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ComplianceHoursThreshold *float64 `json:"compliance_hours_threshold"`
		CompliancePctThreshold   *float64 `json:"compliance_pct_threshold"`
		LeakWarnP95              *float64 `json:"leak_warn_p95"`
		LeakAlertP95             *float64 `json:"leak_alert_p95"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.ComplianceHoursThreshold != nil {
		v := *body.ComplianceHoursThreshold
		if v < 0.5 || v > 12 {
			writeError(w, http.StatusBadRequest, "compliance_hours_threshold must be between 0.5 and 12")
			return
		}
		if err := h.svc.SetFloat(service.KeyComplianceHours, v); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save hours threshold")
			return
		}
	}

	if body.CompliancePctThreshold != nil {
		v := *body.CompliancePctThreshold
		if v < 0 || v > 100 {
			writeError(w, http.StatusBadRequest, "compliance_pct_threshold must be between 0 and 100")
			return
		}
		if err := h.svc.SetFloat(service.KeyCompliancePct, v); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save percentage threshold")
			return
		}
	}

	if body.LeakWarnP95 != nil {
		v := *body.LeakWarnP95
		if v < 1 || v > 200 {
			writeError(w, http.StatusBadRequest, "leak_warn_p95 must be between 1 and 200")
			return
		}
		if err := h.svc.SetFloat(service.KeyLeakWarnP95, v); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save leak warn threshold")
			return
		}
	}

	if body.LeakAlertP95 != nil {
		v := *body.LeakAlertP95
		if v < 1 || v > 200 {
			writeError(w, http.StatusBadRequest, "leak_alert_p95 must be between 1 and 200")
			return
		}
		if err := h.svc.SetFloat(service.KeyLeakAlertP95, v); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save leak alert threshold")
			return
		}
	}

	settings, err := h.svc.Get()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read settings after update")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}
