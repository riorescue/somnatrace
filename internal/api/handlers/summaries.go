// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package handlers

import (
	"net/http"
	"strconv"

	"github.com/somnatrace/somnatrace/internal/models"
	"github.com/somnatrace/somnatrace/internal/service"
)

// SummariesHandler serves daily therapy summary endpoints.
type SummariesHandler struct {
	svc *service.SummaryService
}

// NewSummariesHandler returns a SummariesHandler backed by svc.
func NewSummariesHandler(svc *service.SummaryService) *SummariesHandler {
	return &SummariesHandler{svc: svc}
}

// ListDaily handles GET /api/v1/summaries/daily. An optional "limit" query
// parameter controls how many rows are returned (default 30, max 365).
func (h *SummariesHandler) ListDaily(w http.ResponseWriter, r *http.Request) {
	limit := 30
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			limit = n
		}
	}

	summaries, err := h.svc.ListDaily(limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list summaries")
		return
	}
	if summaries == nil {
		summaries = make([]models.DailySummary, 0)
	}
	writeJSON(w, http.StatusOK, map[string]any{"summaries": summaries})
}
