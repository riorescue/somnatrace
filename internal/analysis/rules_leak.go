// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package analysis

import (
	"fmt"

	"github.com/somnatrace/somnatrace/internal/models"
)

// L-01: total leak > 40 L/min for >= 30 s (15 samples at 2 s)
// 40 L/min covers the intentional vent leak for any mask type + unintentional leak threshold.
type LargeLeakEventRule struct{}

func (r *LargeLeakEventRule) ID() string { return "L-01" }

func (r *LargeLeakEventRule) Analyze(signals *models.SessionSignals) []Finding {
	runs := findRuns(signals.Leak, 40.0, 15)
	var findings []Finding
	for _, run := range runs {
		dur := signals.Leak[run[1]].T - signals.Leak[run[0]].T + 2
		findings = append(findings, Finding{
			RuleID:   r.ID(),
			Title:    "Large Leak Event",
			Detail:   fmt.Sprintf("Total mask leak exceeded 40 L/min for %.0f seconds. This exceeds the clinical threshold for unintentional mask leak (ResMed AirView threshold: >24 L/min unintentional). Pressure delivery is compromised — check mask fit, position, and facial seal.", dur),
			Severity: Alert,
			StartSec: ptr(signals.Leak[run[0]].T),
			EndSec:   ptr(signals.Leak[run[1]].T),
		})
	}
	return findings
}

// L-02: total leak > 60 L/min for >= 30 s — massive seal failure
type SevereLeakEventRule struct{}

func (r *SevereLeakEventRule) ID() string { return "L-02" }

func (r *SevereLeakEventRule) Analyze(signals *models.SessionSignals) []Finding {
	runs := findRuns(signals.Leak, 60.0, 15)
	var findings []Finding
	for _, run := range runs {
		dur := signals.Leak[run[1]].T - signals.Leak[run[0]].T + 2
		findings = append(findings, Finding{
			RuleID:   r.ID(),
			Title:    "Severe Mask Leak",
			Detail:   fmt.Sprintf("Total mask leak exceeded 60 L/min for %.0f seconds — a massive seal failure. At this level, pressure delivery is unreliable and device-reported events (AHI, apneas) during this window may be artifact. Immediate mask adjustment is required.", dur),
			Severity: Critical,
			StartSec: ptr(signals.Leak[run[0]].T),
			EndSec:   ptr(signals.Leak[run[1]].T),
		})
	}
	return findings
}

// L-03: 95th-percentile session total leak > 40 L/min
type ElevatedSessionLeakRule struct{}

func (r *ElevatedSessionLeakRule) ID() string { return "L-03" }

func (r *ElevatedSessionLeakRule) Analyze(signals *models.SessionSignals) []Finding {
	p95 := percentile(signals.Leak, 0.95)
	if p95 <= 40.0 {
		return nil
	}
	return []Finding{{
		RuleID:   r.ID(),
		Title:    "Elevated Session Leak (P95)",
		Detail:   fmt.Sprintf("The 95th-percentile total mask leak for this session was %.1f L/min. This session-level metric indicates that large mask leak was a persistent issue throughout the night, not an isolated event.", p95),
		Severity: Alert,
	}}
}

// L-04: frequent threshold crossings indicate intermittent positional leak
type IntermittentLeakRule struct{}

func (r *IntermittentLeakRule) ID() string { return "L-04" }

func (r *IntermittentLeakRule) Analyze(signals *models.SessionSignals) []Finding {
	const threshold = 40.0
	if len(signals.Leak) < 2 {
		return nil
	}
	crossings := 0
	for i := 1; i < len(signals.Leak); i++ {
		prev := signals.Leak[i-1].V > threshold
		curr := signals.Leak[i].V > threshold
		if prev != curr {
			crossings++
		}
	}
	durationHours := (signals.Leak[len(signals.Leak)-1].T - signals.Leak[0].T) / 3600.0
	if durationHours < 0.1 {
		return nil
	}
	// Each event = 2 crossings (up + down), so events/hr = crossings / 2 / hours
	eventsPerHour := float64(crossings) / 2 / durationHours
	if eventsPerHour <= 4 {
		return nil
	}
	return []Finding{{
		RuleID:   r.ID(),
		Title:    "Intermittent Leak Pattern",
		Detail:   fmt.Sprintf("Mask leak crossed the 40 L/min threshold approximately %.1f times per hour. This intermittent pattern typically indicates positional leak — mouth opening during sleep or mask displacement with body movement — rather than a structural seal failure.", eventsPerHour),
		Severity: Warning,
	}}
}

// L-05: > 30% of session samples above 40 L/min — sustained structural leak
type SustainedLeakRule struct{}

func (r *SustainedLeakRule) ID() string { return "L-05" }

func (r *SustainedLeakRule) Analyze(signals *models.SessionSignals) []Finding {
	if len(signals.Leak) == 0 {
		return nil
	}
	above := 0
	for _, p := range signals.Leak {
		if p.V > 40.0 {
			above++
		}
	}
	pct := float64(above) / float64(len(signals.Leak)) * 100
	if pct <= 30.0 {
		return nil
	}
	return []Finding{{
		RuleID:   r.ID(),
		Title:    "Sustained Mask Leak",
		Detail:   fmt.Sprintf("Mask leak exceeded 40 L/min for %.0f%% of the session — a sustained seal failure. This level of persistent leak indicates a structural mask fit problem: wrong mask size, facial hair interference, or incorrect mask positioning. Therapy efficacy is likely compromised for this session.", pct),
		Severity: Alert,
	}}
}
