package models

// Finding is a single clinical observation produced by the analysis engine and
// stored in session_findings. StartSec and EndSec locate the event within the
// session timeline; both are nil for session-wide findings.
type Finding struct {
	ID        string   `json:"id"`
	SessionID string   `json:"session_id"`
	RuleID    string   `json:"rule_id"`             // e.g. "L-01", "P-03"
	Title     string   `json:"title"`               // short human-readable label
	Detail    string   `json:"detail"`              // full clinical description
	Severity  string   `json:"severity"`            // "info" | "warning" | "alert" | "critical"
	StartSec  *float64 `json:"start_sec,omitempty"` // seconds from session start; nil = session-wide
	EndSec    *float64 `json:"end_sec,omitempty"`   // seconds from session start; nil = session-wide
}
