// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package app wires together the database, service layer, and HTTP router
// into a single App value that the main entry point can start and stop.
package app

import (
	"log"
	"net/http"

	"github.com/riorescue/somnatrace/internal/api"
	"github.com/riorescue/somnatrace/internal/config"
	"github.com/riorescue/somnatrace/internal/db"
	"github.com/riorescue/somnatrace/internal/service"
)

// App holds the shared resources owned by the running process.
type App struct {
	cfg     *config.Config
	db      *db.DB
	handler http.Handler
}

// New opens the database, applies any pending migrations, initialises the
// service layer, and constructs the HTTP router. The caller must call Close
// when the application shuts down to release the database connection.
func New(cfg *config.Config) (*App, error) {
	database, err := db.Open(cfg.DBPath)
	if err != nil {
		return nil, err
	}

	if err := database.Migrate(); err != nil {
		database.Close()
		return nil, err
	}

	log.Printf("database ready: %s", cfg.DBPath)

	svc := service.New(database)

	// Any import stuck in pending_review from a previous run lost its in-memory
	// candidates when the server stopped, so it can never be confirmed.
	svc.Imports.FailPendingReviews()

	handler := api.NewRouter(cfg, svc)

	return &App{
		cfg:     cfg,
		db:      database,
		handler: handler,
	}, nil
}

// Handler returns the root HTTP handler for the application.
func (a *App) Handler() http.Handler {
	return a.handler
}

// Close releases the database connection. It is safe to call multiple times.
func (a *App) Close() {
	if a.db != nil {
		a.db.Close()
	}
}
