package service

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/somnatrace/somnatrace/internal/analysis"
	"github.com/somnatrace/somnatrace/internal/db"
)

// AnalysisService runs the clinical analysis engine against stored session
// signals and persists the resulting findings.
type AnalysisService struct {
	db     *db.DB
	engine *analysis.Engine
}

// filterDisabled removes any findings whose rule_id is marked disabled in rule_settings.
// Rules with no entry in rule_settings are treated as enabled.
func (s *AnalysisService) filterDisabled(findings []analysis.Finding) ([]analysis.Finding, error) {
	rows, err := s.db.Query(`SELECT rule_id FROM rule_settings WHERE enabled = 0`)
	if err != nil {
		return nil, fmt.Errorf("query rule_settings: %w", err)
	}
	defer rows.Close()

	disabled := make(map[string]bool)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan rule_settings: %w", err)
		}
		disabled[id] = true
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rule_settings: %w", err)
	}
	if len(disabled) == 0 {
		return findings, nil
	}

	active := findings[:0:0]
	for _, f := range findings {
		if !disabled[f.RuleID] {
			active = append(active, f)
		}
	}
	return active, nil
}

// RunAndStore runs all clinical rules against the signals stored for sessionID
// and writes the results to session_findings. Any existing findings for the
// session are replaced, making this safe to call on re-import.
// A nil return means analysis completed (possibly with zero findings).
func (s *AnalysisService) RunAndStore(sessionID string) error {
	sigSvc := &SessionService{db: s.db}
	signals, err := sigSvc.GetSignals(sessionID)
	if err != nil {
		return fmt.Errorf("get signals: %w", err)
	}
	if signals == nil {
		return nil // no signal data — nothing to analyse
	}

	all := s.engine.Analyze(signals)
	findings, err := s.filterDisabled(all)
	if err != nil {
		return fmt.Errorf("filter disabled rules: %w", err)
	}

	if _, err := s.db.Exec(`DELETE FROM session_findings WHERE session_id = ?`, sessionID); err != nil {
		return fmt.Errorf("clear findings: %w", err)
	}

	nowStr := time.Now().UTC().Format(time.RFC3339)
	for _, f := range findings {
		id := newID()
		startSec := sql.NullFloat64{}
		endSec := sql.NullFloat64{}
		if f.StartSec != nil {
			startSec = sql.NullFloat64{Float64: *f.StartSec, Valid: true}
		}
		if f.EndSec != nil {
			endSec = sql.NullFloat64{Float64: *f.EndSec, Valid: true}
		}
		if _, err := s.db.Exec(`
			INSERT INTO session_findings
			  (id, session_id, rule_id, title, detail, severity, start_sec, end_sec, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, id, sessionID, f.RuleID, f.Title, f.Detail, string(f.Severity),
			startSec, endSec, nowStr,
		); err != nil {
			return fmt.Errorf("insert finding %s: %w", f.RuleID, err)
		}
	}
	return nil
}
