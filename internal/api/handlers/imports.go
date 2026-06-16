// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/riorescue/somnatrace/internal/models"
	"github.com/riorescue/somnatrace/internal/service"
)


// ImportsHandler serves import listing and creation endpoints.
type ImportsHandler struct {
	svc *service.ImportService
}

// NewImportsHandler returns an ImportsHandler backed by svc.
func NewImportsHandler(svc *service.ImportService) *ImportsHandler {
	return &ImportsHandler{svc: svc}
}

// List handles GET /api/v1/imports and returns all import records newest first.
func (h *ImportsHandler) List(w http.ResponseWriter, r *http.Request) {
	imports, err := h.svc.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list imports")
		return
	}
	if imports == nil {
		imports = make([]models.Import, 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"imports": imports})
}

// Create handles POST /api/v1/imports. It creates a pending import record and
// starts the import pipeline asynchronously. The client should poll the list
// endpoint to observe status changes.
func (h *ImportsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SourcePath string `json:"source_path"`
		SourceName string `json:"source_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.SourcePath == "" {
		writeError(w, http.StatusBadRequest, "source_path is required")
		return
	}
	if body.SourceName == "" {
		body.SourceName = body.SourcePath
	}

	imp, err := h.svc.Create(body.SourcePath, body.SourceName)
	if err != nil {
		if errors.Is(err, service.ErrPendingReview) {
			writeError(w, http.StatusConflict, "an import is already awaiting session review — complete it before starting a new one")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create import")
		return
	}

	// Launch the real import pipeline in the background.
	h.svc.RunImport(imp.ID, body.SourcePath)

	writeJSON(w, http.StatusAccepted, imp)
}

// Candidates handles GET /api/v1/imports/{id}/candidates and returns the list
// of discovered sessions for an import in pending_review status.
func (h *ImportsHandler) Candidates(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	candidates, err := h.svc.Candidates(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "candidates not available — import may not be in pending_review state")
		return
	}
	if candidates == nil {
		candidates = make([]service.SessionCandidate, 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": candidates})
}

// Cancel handles POST /api/v1/imports/{id}/cancel. It discards an import that
// is in pending_review state, marking it cancelled and freeing the in-memory
// candidate slot so a new import can be started.
func (h *ImportsHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.svc.Cancel(id); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

// Confirm handles POST /api/v1/imports/{id}/confirm. It accepts a list of
// candidate session IDs to include (and optional per-session metadata) and
// starts the persist phase asynchronously.
func (h *ImportsHandler) Confirm(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		SessionIDs      []string                        `json:"session_ids"`
		SessionMetadata map[string]service.SessionMeta  `json:"session_metadata,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.SessionMetadata == nil {
		body.SessionMetadata = make(map[string]service.SessionMeta)
	}
	if err := h.svc.Confirm(id, body.SessionIDs, body.SessionMetadata); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}
