// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package handlers

import (
	"net/http"
	"runtime"
	"time"

	"github.com/somnatrace/somnatrace/internal/config"
)

// HealthHandler serves GET /api/v1/health with basic application metadata.
type HealthHandler struct {
	cfg       *config.Config
	startTime time.Time
}

// NewHealthHandler returns a HealthHandler that tracks its own start time for
// uptime reporting.
func NewHealthHandler(cfg *config.Config) *HealthHandler {
	return &HealthHandler{cfg: cfg, startTime: time.Now()}
}

// ServeHTTP writes a JSON body containing version, mode, uptime, Go runtime
// version, current timestamp, and the database path.
func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "ok",
		"version":    config.Version,
		"mode":       h.cfg.Mode,
		"uptime":     time.Since(h.startTime).String(),
		"go_version": runtime.Version(),
		"timestamp":  time.Now().UTC(),
		"db_path":    h.cfg.DBPath,
	})
}
