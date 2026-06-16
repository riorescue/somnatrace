// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package handlers

import (
	"net/http"
	"strconv"

	"github.com/riorescue/somnatrace/internal/service"
)

// InsightsHandler serves the aggregated insights endpoint used by the
// multi-night Insights dashboard.
type InsightsHandler struct {
	svc *service.SummaryService
}

// NewInsightsHandler returns an InsightsHandler backed by svc.
func NewInsightsHandler(svc *service.SummaryService) *InsightsHandler {
	return &InsightsHandler{svc: svc}
}

// Get handles GET /api/v1/insights. An optional "days" query parameter sets
// the lookback window (default 30, max 365). Streak values are always computed
// from all-time data regardless of the selected period.
func (h *InsightsHandler) Get(w http.ResponseWriter, r *http.Request) {
	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			days = n
		}
	}

	result, err := h.svc.GetInsights(days)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load insights")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
