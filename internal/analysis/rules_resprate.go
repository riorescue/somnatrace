// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package analysis

import (
	"fmt"

	"github.com/riorescue/somnatrace/internal/models"
)

// RR-01: resp_rate < 10 bpm for >= 60 s (30 samples at 2 s)
// Exclude zero values which represent device non-detection, not true bradypnea.
type BradypneaRule struct{}

func (r *BradypneaRule) ID() string { return "RR-01" }

func (r *BradypneaRule) Analyze(signals *models.SessionSignals) []Finding {
	runs := findRunsPred(signals.RespRate, func(v float64) bool { return v > 0 && v < 10 }, 30)
	var findings []Finding
	for _, run := range runs {
		dur := signals.RespRate[run[1]].T - signals.RespRate[run[0]].T + 2
		findings = append(findings, Finding{
			RuleID:   r.ID(),
			Title:    "Bradypnea",
			Detail:   fmt.Sprintf("Respiratory rate fell below 10 breaths/min for %.0f seconds. During sleep the typical rate is 10–16 breaths/min (NREM) and slightly higher in REM. Persistent bradypnea may indicate hypoventilation.", dur),
			Severity: Warning,
			StartSec: ptr(signals.RespRate[run[0]].T),
			EndSec:   ptr(signals.RespRate[run[1]].T),
		})
	}
	return findings
}

// RR-02: resp_rate < 6 bpm for >= 20 s (10 samples at 2 s)
type SevereBradypneaRule struct{}

func (r *SevereBradypneaRule) ID() string { return "RR-02" }

func (r *SevereBradypneaRule) Analyze(signals *models.SessionSignals) []Finding {
	runs := findRunsPred(signals.RespRate, func(v float64) bool { return v > 0 && v < 6 }, 10)
	var findings []Finding
	for _, run := range runs {
		dur := signals.RespRate[run[1]].T - signals.RespRate[run[0]].T + 2
		findings = append(findings, Finding{
			RuleID:   r.ID(),
			Title:    "Severe Bradypnea",
			Detail:   fmt.Sprintf("Respiratory rate fell below 6 breaths/min for %.0f seconds. This degree of hypoventilation may indicate central respiratory depression. Clinical evaluation is recommended.", dur),
			Severity: Alert,
			StartSec: ptr(signals.RespRate[run[0]].T),
			EndSec:   ptr(signals.RespRate[run[1]].T),
		})
	}
	return findings
}

// RR-03: resp_rate > 20 bpm for >= 2 minutes (60 samples at 2 s)
type TachypneaRule struct{}

func (r *TachypneaRule) ID() string { return "RR-03" }

func (r *TachypneaRule) Analyze(signals *models.SessionSignals) []Finding {
	runs := findRunsPred(signals.RespRate, func(v float64) bool { return v > 20 }, 60)
	var findings []Finding
	for _, run := range runs {
		dur := signals.RespRate[run[1]].T - signals.RespRate[run[0]].T + 2
		findings = append(findings, Finding{
			RuleID:   r.ID(),
			Title:    "Tachypnea During Sleep",
			Detail:   fmt.Sprintf("Respiratory rate exceeded 20 breaths/min for %.0f seconds. Sustained tachypnea during sleep suggests arousal, air hunger from inadequate pressure, or possible cardiorespiratory compromise.", dur),
			Severity: Warning,
			StartSec: ptr(signals.RespRate[run[0]].T),
			EndSec:   ptr(signals.RespRate[run[1]].T),
		})
	}
	return findings
}

// RR-04: resp_rate > 25 bpm for >= 60 s (30 samples at 2 s)
type SevereTachypneaRule struct{}

func (r *SevereTachypneaRule) ID() string { return "RR-04" }

func (r *SevereTachypneaRule) Analyze(signals *models.SessionSignals) []Finding {
	runs := findRunsPred(signals.RespRate, func(v float64) bool { return v > 25 }, 30)
	var findings []Finding
	for _, run := range runs {
		dur := signals.RespRate[run[1]].T - signals.RespRate[run[0]].T + 2
		findings = append(findings, Finding{
			RuleID:   r.ID(),
			Title:    "Severe Tachypnea",
			Detail:   fmt.Sprintf("Respiratory rate exceeded 25 breaths/min for %.0f seconds. Consistent with hypercapnic drive or prolonged arousal. Clinical review is recommended.", dur),
			Severity: Alert,
			StartSec: ptr(signals.RespRate[run[0]].T),
			EndSec:   ptr(signals.RespRate[run[1]].T),
		})
	}
	return findings
}

// RR-05: periodic breathing / Cheyne-Stokes pattern.
// Uses autocorrelation of resp_rate to detect 45–120 s cyclic oscillation.
// AASM criterion: pattern must persist > 10 minutes (300 samples at 2 s).
type PeriodicBreathingRule struct{}

func (r *PeriodicBreathingRule) ID() string { return "RR-05" }

func (r *PeriodicBreathingRule) Analyze(signals *models.SessionSignals) []Finding {
	if len(signals.RespRate) < 300 { // < 10 minutes
		return nil
	}

	const lagMin = 22          // 44 s at 2 s intervals
	const lagMax = 60          // 120 s at 2 s intervals
	const corrThreshold = 0.40 // minimum autocorrelation coefficient
	const ampThreshold = 5.0   // bpm oscillation amplitude required

	n := len(signals.RespRate)
	vals := make([]float64, n)
	mean := 0.0
	for i, p := range signals.RespRate {
		vals[i] = p.V
		mean += p.V
	}
	mean /= float64(n)
	for i := range vals {
		vals[i] -= mean
	}

	variance := 0.0
	for _, v := range vals {
		variance += v * v
	}
	if variance < 1e-6 {
		return nil
	}

	bestCorr, bestLag := 0.0, 0
	for lag := lagMin; lag <= lagMax && lag < n; lag++ {
		corr := 0.0
		for i := 0; i < n-lag; i++ {
			corr += vals[i] * vals[i+lag]
		}
		corr /= variance
		if corr > bestCorr {
			bestCorr = corr
			bestLag = lag
		}
	}

	if bestCorr < corrThreshold {
		return nil
	}

	// Require meaningful oscillation amplitude.
	maxV, minV := vals[0], vals[0]
	for _, v := range vals {
		if v > maxV {
			maxV = v
		}
		if v < minV {
			minV = v
		}
	}
	if maxV-minV < ampThreshold {
		return nil
	}

	cycleSeconds := float64(bestLag) * 2

	// Check for apneic phases (resp_rate < 6) — Cheyne-Stokes signature.
	apneicSamples := 0
	for _, p := range signals.RespRate {
		if p.V < 6 && p.V >= 0 {
			apneicSamples++
		}
	}
	apneicPct := float64(apneicSamples) / float64(n) * 100

	if apneicPct > 5 {
		return []Finding{{
			RuleID:   r.ID(),
			Title:    "Cheyne-Stokes Pattern Detected",
			Detail:   fmt.Sprintf("Respiratory rate shows a crescendo-decrescendo cycle with a %.0f-second period (autocorrelation %.2f) and includes apneic phases in %.0f%% of the session. This pattern is associated with cardiac or neurological compromise and may indicate treatment-emergent central sleep apnea. Evaluation by a sleep physician is strongly recommended.", cycleSeconds, bestCorr, apneicPct),
			Severity: Critical,
		}}
	}

	return []Finding{{
		RuleID:   r.ID(),
		Title:    "Periodic Breathing Pattern",
		Detail:   fmt.Sprintf("Respiratory rate shows cyclic oscillation with a %.0f-second period (autocorrelation coefficient %.2f). Periodic breathing during CPAP therapy may indicate treatment-emergent central events. Clinical follow-up is advisable.", cycleSeconds, bestCorr),
		Severity: Alert,
	}}
}
