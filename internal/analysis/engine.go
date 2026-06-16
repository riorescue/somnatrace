// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package analysis provides a rule-based clinical analysis engine for sleep
// therapy session data. Rules are self-contained structs implementing Rule;
// new rules can be added by implementing the interface and registering with
// Register or by appending to DefaultEngine.
package analysis

import "github.com/riorescue/somnatrace/internal/models"

type Severity string

const (
	Info     Severity = "info"
	Warning  Severity = "warning"
	Alert    Severity = "alert"
	Critical Severity = "critical"
)

// RuleInfo describes a clinical rule's static metadata for display in the UI.
type RuleInfo struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Category    string   `json:"category"`
	Severity    Severity `json:"severity"`
}

// DescribeRules returns the static metadata catalog for all built-in rules in
// the same order they appear in DefaultEngine.
func DescribeRules() []RuleInfo {
	return []RuleInfo{
		// Pressure
		{ID: "P-01", Title: "Pressure Near Device Maximum", Category: "Pressure", Severity: Alert,
			Description: "95th-percentile session pressure ≥ 18 cmH₂O, approaching the device limit of 20 cmH₂O."},
		{ID: "P-02", Title: "Active Pressure Ceiling", Category: "Pressure", Severity: Critical,
			Description: "Pressure held at the device ceiling (≥ 19.5 cmH₂O) for 5 or more consecutive minutes."},
		{ID: "P-03", Title: "Possibly Subtherapeutic Pressure", Category: "Pressure", Severity: Warning,
			Description: "Median session pressure below 6 cmH₂O, potentially insufficient to maintain airway patency."},
		{ID: "P-04", Title: "Unstable Pressure (Hunting)", Category: "Pressure", Severity: Warning,
			Description: "Pressure oscillates without settling in ≥ 20% of 5-minute analysis windows."},
		// Leak
		{ID: "L-01", Title: "Large Leak Event", Category: "Leak", Severity: Alert,
			Description: "Total mask leak exceeds 40 L/min for 30 or more consecutive seconds."},
		{ID: "L-02", Title: "Severe Mask Leak", Category: "Leak", Severity: Critical,
			Description: "Total mask leak exceeds 60 L/min for ≥ 30 seconds — massive seal failure."},
		{ID: "L-03", Title: "Elevated Session Leak (P95)", Category: "Leak", Severity: Alert,
			Description: "Session 95th-percentile total leak above 40 L/min — persistent elevated leak."},
		{ID: "L-04", Title: "Intermittent Leak Pattern", Category: "Leak", Severity: Warning,
			Description: "Mask leak crosses 40 L/min threshold more than 4 times per hour — intermittent positional pattern."},
		{ID: "L-05", Title: "Sustained Mask Leak", Category: "Leak", Severity: Alert,
			Description: "More than 30% of the session spent above 40 L/min — sustained structural seal failure."},
		// Respiratory rate
		{ID: "RR-01", Title: "Bradypnea", Category: "Respiratory Rate", Severity: Warning,
			Description: "Respiratory rate falls below 10 bpm for ≥ 60 consecutive seconds."},
		{ID: "RR-02", Title: "Severe Bradypnea", Category: "Respiratory Rate", Severity: Alert,
			Description: "Respiratory rate falls below 6 bpm for ≥ 20 consecutive seconds."},
		{ID: "RR-03", Title: "Tachypnea During Sleep", Category: "Respiratory Rate", Severity: Warning,
			Description: "Respiratory rate exceeds 20 bpm for ≥ 2 consecutive minutes."},
		{ID: "RR-04", Title: "Severe Tachypnea", Category: "Respiratory Rate", Severity: Alert,
			Description: "Respiratory rate exceeds 25 bpm for ≥ 60 consecutive seconds."},
		{ID: "RR-05", Title: "Periodic Breathing / Cheyne-Stokes", Category: "Respiratory Rate", Severity: Critical,
			Description: "Cyclic 45–120 s respiratory oscillation persisting > 10 minutes; includes Cheyne-Stokes variant."},
		// Flow waveform
		{ID: "F-01", Title: "Probable Apnea", Category: "Flow", Severity: Alert,
			Description: "Airflow amplitude drops to < 10% of rolling baseline for 10–90 seconds (AASM apnea criterion)."},
		{ID: "F-02", Title: "Probable Hypopnea", Category: "Flow", Severity: Warning,
			Description: "Airflow at 10–50% of rolling baseline for ≥ 10 seconds (AASM hypopnea criterion)."},
		// Flow limitation
		{ID: "FL-01", Title: "Mild Flow Limitation", Category: "Flow Limitation", Severity: Info,
			Description: "Inspiratory flow flattening index > 0.10 for ≥ 2 continuous minutes — UARS territory."},
		{ID: "FL-02", Title: "Moderate Flow Limitation / Probable RERA", Category: "Flow Limitation", Severity: Warning,
			Description: "Flow limitation index > 0.25 for ≥ 60 seconds — correlates with respiratory effort-related arousals."},
		{ID: "FL-03", Title: "Severe Flow Limitation", Category: "Flow Limitation", Severity: Alert,
			Description: "Flow limitation index > 0.40 for ≥ 30 seconds — significant upper airway obstruction."},
		{ID: "FL-04", Title: "Flow Limitation Burden", Category: "Flow Limitation", Severity: Critical,
			Description: "Session-level percentage of time with flow limitation index > 0.25 (5–15%: warning; >15%: alert; >30%: critical)."},
		{ID: "FL-05", Title: "Flow Limitation Without Pressure Response", Category: "Flow Limitation", Severity: Warning,
			Description: "Flow limitation index > 0.30 for ≥ 2 minutes with no corresponding pressure increase from the device."},
	}
}

// Finding is a single clinical observation produced by a Rule.
type Finding struct {
	RuleID   string
	Title    string
	Detail   string
	Severity Severity
	StartSec *float64 // nil = session-wide finding
	EndSec   *float64
}

// Rule analyses a complete set of session signals and returns zero or more
// Findings. Implementations should be stateless and safe for concurrent use.
type Rule interface {
	ID() string
	Analyze(signals *models.SessionSignals) []Finding
}

// Engine runs a registered set of Rules against session signals.
type Engine struct {
	rules []Rule
}

func New() *Engine { return &Engine{} }

func (e *Engine) Register(rules ...Rule) {
	e.rules = append(e.rules, rules...)
}

// Analyze runs all registered rules. Returns nil if the session is too short
// for meaningful analysis (< 30 minutes of pressure data).
func (e *Engine) Analyze(signals *models.SessionSignals) []Finding {
	if len(signals.Pressure) == 0 {
		return nil
	}
	durationMin := signals.Pressure[len(signals.Pressure)-1].T / 60.0
	if durationMin < 30 {
		return []Finding{{
			RuleID:   "SYS-MIN",
			Title:    "Session Too Short for Full Analysis",
			Detail:   "Clinical analysis requires at least 30 minutes of signal data. This session is shorter and results may be incomplete.",
			Severity: Info,
		}}
	}

	var findings []Finding
	for _, rule := range e.rules {
		findings = append(findings, rule.Analyze(signals)...)
	}
	return findings
}

// DefaultEngine returns an Engine pre-loaded with all built-in clinical rules.
// Add new rules here as the library grows.
func DefaultEngine() *Engine {
	e := New()
	e.Register(
		// Pressure
		&PressureNearMaxRule{},
		&PressureCeilingRule{},
		&SubtherapeuticPressureRule{},
		&PressureHuntingRule{},
		// Leak
		&LargeLeakEventRule{},
		&SevereLeakEventRule{},
		&ElevatedSessionLeakRule{},
		&IntermittentLeakRule{},
		&SustainedLeakRule{},
		// Respiratory rate
		&BradypneaRule{},
		&SevereBradypneaRule{},
		&TachypneaRule{},
		&SevereTachypneaRule{},
		&PeriodicBreathingRule{},
		// Flow waveform
		&ProbableApneaRule{},
		&ProbableHypopneaRule{},
		// Flow limitation
		&MildFlowLimitationRule{},
		&ModerateFlowLimitationRule{},
		&SevereFlowLimitationRule{},
		&FlowLimitationBurdenRule{},
		&FlowLimitationNoResponseRule{},
	)
	return e
}
