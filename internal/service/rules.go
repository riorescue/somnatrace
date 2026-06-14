package service

import (
	"fmt"

	"github.com/somnatrace/somnatrace/internal/analysis"
	"github.com/somnatrace/somnatrace/internal/db"
)

// RulesService manages clinical rule enable/disable settings.
type RulesService struct {
	db *db.DB
}

// RuleStatus pairs a rule's static metadata with its current enabled state.
type RuleStatus struct {
	analysis.RuleInfo
	Enabled bool `json:"enabled"`
}

// List returns all built-in rules with their current enabled/disabled status.
// Rules with no entry in rule_settings are considered enabled by default.
func (s *RulesService) List() ([]RuleStatus, error) {
	rows, err := s.db.Query(`SELECT rule_id, enabled FROM rule_settings`)
	if err != nil {
		return nil, fmt.Errorf("query rule_settings: %w", err)
	}
	defer rows.Close()

	disabled := make(map[string]bool)
	for rows.Next() {
		var id string
		var enabled int
		if err := rows.Scan(&id, &enabled); err != nil {
			return nil, fmt.Errorf("scan rule_settings row: %w", err)
		}
		if enabled == 0 {
			disabled[id] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rule_settings: %w", err)
	}

	catalog := analysis.DescribeRules()
	result := make([]RuleStatus, len(catalog))
	for i, info := range catalog {
		result[i] = RuleStatus{RuleInfo: info, Enabled: !disabled[info.ID]}
	}
	return result, nil
}

// SetEnabled persists the enabled/disabled state for ruleID.
func (s *RulesService) SetEnabled(ruleID string, enabled bool) error {
	enabledInt := 1
	if !enabled {
		enabledInt = 0
	}
	_, err := s.db.Exec(`
		INSERT INTO rule_settings (rule_id, enabled, updated_at)
		VALUES (?, ?, datetime('now'))
		ON CONFLICT(rule_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at
	`, ruleID, enabledInt)
	if err != nil {
		return fmt.Errorf("upsert rule_settings: %w", err)
	}
	return nil
}
