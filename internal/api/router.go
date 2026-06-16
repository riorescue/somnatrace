// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package api wires HTTP routes to their handler implementations and applies
// shared middleware (CORS, request logging). All routes are prefixed with
// /api/v1/. The embedded frontend is registered separately by the web package.
package api

import (
	"net/http"

	"github.com/riorescue/somnatrace/internal/api/handlers"
	"github.com/riorescue/somnatrace/internal/api/middleware"
	"github.com/riorescue/somnatrace/internal/config"
	"github.com/riorescue/somnatrace/internal/service"
	"github.com/riorescue/somnatrace/internal/web"
)

// NewRouter constructs the root HTTP handler with all API routes registered
// and CORS + logging middleware applied.
func NewRouter(cfg *config.Config, svc *service.Services) http.Handler {
	mux := http.NewServeMux()

	health := handlers.NewHealthHandler(cfg)
	devices := handlers.NewDevicesHandler(svc.Devices)
	imports := handlers.NewImportsHandler(svc.Imports)
	sessions := handlers.NewSessionsHandler(svc.Sessions, svc.Analysis)
	summaries := handlers.NewSummariesHandler(svc.Summaries)
	insights := handlers.NewInsightsHandler(svc.Summaries)
	utilities := handlers.NewUtilitiesHandler(svc.Utilities)
	rules := handlers.NewRulesHandler(svc.Rules)
	appSettings := handlers.NewAppSettingsHandler(svc.AppSettings)
	masks := handlers.NewMasksHandler(svc.Masks)

	mux.Handle("GET /api/v1/health", health)
	mux.HandleFunc("GET /api/v1/devices", devices.List)
	mux.HandleFunc("GET /api/v1/imports", imports.List)
	mux.HandleFunc("POST /api/v1/imports", imports.Create)
	mux.HandleFunc("GET /api/v1/imports/{id}/candidates", imports.Candidates)
	mux.HandleFunc("POST /api/v1/imports/{id}/cancel", imports.Cancel)
	mux.HandleFunc("POST /api/v1/imports/{id}/confirm", imports.Confirm)
	mux.HandleFunc("GET /api/v1/sessions", sessions.List)
	mux.HandleFunc("GET /api/v1/sessions/{id}", sessions.Get)
	mux.HandleFunc("GET /api/v1/sessions/{id}/signals", sessions.GetSignals)
	mux.HandleFunc("GET /api/v1/sessions/{id}/settings", sessions.GetSettings)
	mux.HandleFunc("GET /api/v1/sessions/{id}/identification", sessions.GetIdentification)
	mux.HandleFunc("GET /api/v1/sessions/{id}/findings", sessions.GetFindings)
	mux.HandleFunc("GET /api/v1/sessions/{id}/events", sessions.GetEvents)
	mux.HandleFunc("PATCH /api/v1/sessions/{id}", sessions.Patch)
	mux.HandleFunc("POST /api/v1/sessions/{id}/analyze", sessions.Reanalyze)
	mux.HandleFunc("GET /api/v1/masks", masks.List)
	mux.HandleFunc("GET /api/v1/summaries/daily", summaries.ListDaily)
	mux.HandleFunc("GET /api/v1/insights", insights.Get)
	mux.HandleFunc("GET /api/v1/stats", utilities.Stats)
	mux.HandleFunc("DELETE /api/v1/data", utilities.DeleteAll)
	mux.HandleFunc("POST /api/v1/maintenance/vacuum", utilities.Vacuum)
	mux.HandleFunc("GET /api/v1/detect", utilities.Detect)
	mux.HandleFunc("GET /api/v1/backups", utilities.ListBackups)
	mux.HandleFunc("POST /api/v1/backups", utilities.CreateBackup)
	mux.HandleFunc("POST /api/v1/backups/{id}/restore", utilities.RestoreBackup)
	mux.HandleFunc("DELETE /api/v1/backups/{id}", utilities.DeleteBackup)
	mux.HandleFunc("GET /api/v1/rules", rules.List)
	mux.HandleFunc("PATCH /api/v1/rules/{id}", rules.SetEnabled)
	mux.HandleFunc("GET /api/v1/settings", appSettings.Get)
	mux.HandleFunc("PATCH /api/v1/settings", appSettings.Patch)

	// In production the embedded frontend is served here with SPA fallback.
	// In development this is a no-op; Vite handles the UI on port 5173.
	web.RegisterStaticHandler(mux, cfg)

	var h http.Handler = mux
	h = middleware.Logger(h)
	h = middleware.CORS(h)
	return h
}
