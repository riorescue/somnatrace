// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package service implements the business logic layer. Each service type owns
// one domain area (sessions, imports, summaries, etc.) and is the only code
// that touches the database directly. Handlers call services; services do not
// call handlers.
package service

import (
	"github.com/riorescue/somnatrace/internal/analysis"
	"github.com/riorescue/somnatrace/internal/db"
)

// Services groups all domain services and is passed to the HTTP router as a
// single dependency.
type Services struct {
	Imports     *ImportService
	Sessions    *SessionService
	Summaries   *SummaryService
	Devices     *DeviceService
	Utilities   *UtilitiesService
	Analysis    *AnalysisService
	Rules       *RulesService
	AppSettings *AppSettingsService
	Masks       *MaskService
}

// New constructs all service types wired to the given database connection.
func New(database *db.DB) *Services {
	ana := &AnalysisService{db: database, engine: analysis.DefaultEngine()}
	return &Services{
		Imports:     &ImportService{db: database, ana: ana},
		Sessions:    &SessionService{db: database},
		Summaries:   &SummaryService{db: database},
		Devices:     &DeviceService{db: database},
		Utilities:   &UtilitiesService{db: database},
		Analysis:    ana,
		Rules:       &RulesService{db: database},
		AppSettings: &AppSettingsService{db: database},
		Masks:       &MaskService{db: database},
	}
}
