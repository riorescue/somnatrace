// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/somnatrace/somnatrace/internal/models"
	"github.com/somnatrace/somnatrace/internal/service"
)

// SessionsHandler serves all session-scoped endpoints: list, get, signals,
// settings, identification, events, clinical findings, and re-analysis.
type SessionsHandler struct {
	svc *service.SessionService
	ana *service.AnalysisService
}

// NewSessionsHandler returns a SessionsHandler backed by svc and ana.
func NewSessionsHandler(svc *service.SessionService, ana *service.AnalysisService) *SessionsHandler {
	return &SessionsHandler{svc: svc, ana: ana}
}

// List handles GET /api/v1/sessions. Supports optional query parameters
// event_type and since (YYYY-MM-DD) to filter sessions by event type.
func (h *SessionsHandler) List(w http.ResponseWriter, r *http.Request) {
	eventType := r.URL.Query().Get("event_type")
	since := r.URL.Query().Get("since")

	var (
		sessions []models.Session
		err      error
	)
	if eventType != "" && since != "" {
		sessions, err = h.svc.ListByEventType(eventType, since)
	} else {
		sessions, err = h.svc.List()
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}
	if sessions == nil {
		sessions = make([]models.Session, 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

// Get handles GET /api/v1/sessions/{id} and returns a single session or 404.
func (h *SessionsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing session id")
		return
	}

	sess, err := h.svc.Get(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get session")
		return
	}
	if sess == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

// GetSettings handles GET /api/v1/sessions/{id}/settings and returns the raw
// CurrentSettings.json snapshot captured at import time.
func (h *SessionsHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing session id")
		return
	}
	settings, err := h.svc.GetSettings(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get settings")
		return
	}
	if settings == nil {
		writeError(w, http.StatusNotFound, "no settings snapshot for session")
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

// GetIdentification handles GET /api/v1/sessions/{id}/identification and returns
// the raw Identification.json snapshot captured at import time.
func (h *SessionsHandler) GetIdentification(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing session id")
		return
	}
	ident, err := h.svc.GetIdentification(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get identification")
		return
	}
	if ident == nil {
		writeError(w, http.StatusNotFound, "no identification snapshot for session")
		return
	}
	writeJSON(w, http.StatusOK, ident)
}

// GetSignals handles GET /api/v1/sessions/{id}/signals and returns the stored
// EDF time-series signals for the session.
func (h *SessionsHandler) GetSignals(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing session id")
		return
	}

	signals, err := h.svc.GetSignals(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get signals")
		return
	}
	if signals == nil {
		writeError(w, http.StatusNotFound, "no signal data for session")
		return
	}
	writeJSON(w, http.StatusOK, signals)
}

// GetFindings handles GET /api/v1/sessions/{id}/findings and returns the
// clinical analysis findings stored for the session, ordered by severity.
func (h *SessionsHandler) GetFindings(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing session id")
		return
	}
	findings, err := h.svc.GetFindings(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get findings")
		return
	}
	if findings == nil {
		findings = make([]models.Finding, 0)
	}
	resp := map[string]any{"findings": findings}
	if t, err := h.svc.GetFindingsAnalyzedAt(id); err == nil && t != nil {
		resp["analyzed_at"] = t.Format(time.RFC3339)
	}
	writeJSON(w, http.StatusOK, resp)
}

// GetEvents handles GET /api/v1/sessions/{id}/events and returns the scored
// respiratory events parsed from EDF+ annotation files at import time.
func (h *SessionsHandler) GetEvents(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing session id")
		return
	}
	events, err := h.svc.GetEvents(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get events")
		return
	}
	if events == nil {
		events = make([]models.Event, 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events})
}

// Patch handles PATCH /api/v1/sessions/{id}. It updates the user-editable
// metadata fields (mask_id, notes) for a session. Only fields present in the
// request body are updated.
func (h *SessionsHandler) Patch(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing session id")
		return
	}
	var body struct {
		MaskID      *string `json:"mask_id"`
		Notes       *string `json:"notes"`
		MorningFeel *string `json:"morning_feel"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.svc.PatchMetadata(id, service.SessionPatch{
		MaskID:      body.MaskID,
		Notes:       body.Notes,
		MorningFeel: body.MorningFeel,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update session")
		return
	}
	sess, err := h.svc.Get(id)
	if err != nil || sess == nil {
		writeError(w, http.StatusInternalServerError, "failed to read updated session")
		return
	}
	writeJSON(w, http.StatusOK, sess)
}

// Reanalyze handles POST /api/v1/sessions/{id}/analyze. It re-runs all
// clinical rules against the stored signals and replaces any existing findings.
func (h *SessionsHandler) Reanalyze(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "missing session id")
		return
	}
	if err := h.ana.RunAndStore(id); err != nil {
		writeError(w, http.StatusInternalServerError, "analysis failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
