// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package analysis

import (
	"fmt"
	"math"

	"github.com/somnatrace/somnatrace/internal/models"
)

const deviceMaxPressure = 20.0 // cmH₂O (ResMed AirSense 10 / 11 device maximum)

// P-01: 95th-percentile session pressure >= 18 cmH₂O
type PressureNearMaxRule struct{}

func (r *PressureNearMaxRule) ID() string { return "P-01" }

func (r *PressureNearMaxRule) Analyze(signals *models.SessionSignals) []Finding {
	p95 := percentile(signals.Pressure, 0.95)
	if p95 < 18.0 {
		return nil
	}
	return []Finding{{
		RuleID:   r.ID(),
		Title:    "Pressure Near Device Maximum",
		Detail:   fmt.Sprintf("95th-percentile session pressure was %.1f cmH₂O, approaching the device maximum of %.0f cmH₂O. The APAP algorithm may be pressure-limited, leaving residual respiratory events untreated. Discuss expanding the pressure range with your care team.", p95, deviceMaxPressure),
		Severity: Alert,
	}}
}

// P-02: pressure >= 19.5 cmH₂O for >= 5 consecutive minutes (150 samples at 2 s)
type PressureCeilingRule struct{}

func (r *PressureCeilingRule) ID() string { return "P-02" }

func (r *PressureCeilingRule) Analyze(signals *models.SessionSignals) []Finding {
	const minSamples = 150  // 5 min × 60 s / 2 s
	const threshold = 19.5  // cmH₂O — within 0.5 of max

	pts := signals.Pressure
	var findings []Finding
	i := 0
	for i < len(pts) {
		if pts[i].V >= threshold {
			j := i
			for j < len(pts) && pts[j].V >= threshold {
				j++
			}
			if j-i >= minSamples {
				durationMin := float64(j-i) * 2 / 60
				findings = append(findings, Finding{
					RuleID:   r.ID(),
					Title:    "Active Pressure Ceiling",
					Detail:   fmt.Sprintf("Pressure held at the device maximum (≥%.1f cmH₂O) for %.0f minutes. APAP cannot increase pressure further, meaning therapy was actively insufficient during this window. Clinical review of pressure range is indicated.", threshold, durationMin),
					Severity: Critical,
					StartSec: ptr(pts[i].T),
					EndSec:   ptr(pts[j-1].T),
				})
			}
			i = j
		} else {
			i++
		}
	}
	return findings
}

// P-03: median session pressure < 6 cmH₂O
type SubtherapeuticPressureRule struct{}

func (r *SubtherapeuticPressureRule) ID() string { return "P-03" }

func (r *SubtherapeuticPressureRule) Analyze(signals *models.SessionSignals) []Finding {
	med := median(signals.Pressure)
	if med >= 6.0 {
		return nil
	}
	return []Finding{{
		RuleID:   r.ID(),
		Title:    "Possibly Subtherapeutic Pressure",
		Detail:   fmt.Sprintf("Median session pressure of %.1f cmH₂O is below the typical therapeutic minimum of 6 cmH₂O. Pressures in this range may be insufficient to maintain airway patency. Consider reviewing the APAP minimum pressure setting.", med),
		Severity: Warning,
	}}
}

// P-04: pressure oscillates without directional trend (pressure "hunting")
// Detects: rolling 5-min SD > 2 cmH₂O AND no clear directional slope.
type PressureHuntingRule struct{}

func (r *PressureHuntingRule) ID() string { return "P-04" }

func (r *PressureHuntingRule) Analyze(signals *models.SessionSignals) []Finding {
	const windowSamples = 150  // 5 min at 2 s
	const sdThreshold = 2.0    // cmH₂O
	const slopeThreshold = 0.1 // cmH₂O/min — below this = no clear direction

	pts := signals.Pressure
	if len(pts) < windowSamples*2 {
		return nil
	}

	huntingWindows, totalWindows := 0, 0
	for i := windowSamples; i < len(pts); i += windowSamples / 2 {
		window := pts[i-windowSamples : i]
		totalWindows++

		sum := 0.0
		for _, p := range window {
			sum += p.V
		}
		mean := sum / float64(len(window))

		variance := 0.0
		for _, p := range window {
			d := p.V - mean
			variance += d * d
		}
		sd := math.Sqrt(variance / float64(len(window)))
		if sd <= sdThreshold {
			continue
		}

		// Check directional trend via first vs last third means.
		n := len(window)
		third := n / 3
		if third < 1 {
			continue
		}
		firstMean, lastMean := 0.0, 0.0
		for _, p := range window[:third] {
			firstMean += p.V
		}
		for _, p := range window[2*third:] {
			lastMean += p.V
		}
		firstMean /= float64(third)
		lastMean /= float64(n - 2*third)
		durationMin := float64(n) * 2 / 60
		slope := math.Abs(lastMean-firstMean) / durationMin
		if slope < slopeThreshold {
			huntingWindows++
		}
	}

	if totalWindows == 0 || float64(huntingWindows)/float64(totalWindows) < 0.20 {
		return nil
	}
	return []Finding{{
		RuleID:   r.ID(),
		Title:    "Unstable Pressure (Hunting)",
		Detail:   fmt.Sprintf("Pressure oscillated without settling in %.0f%% of analyzed 5-minute windows. This pattern may indicate persistent unresolved obstruction or mask leak causing the APAP algorithm to repeatedly raise and lower pressure without finding a stable treatment level.", float64(huntingWindows)/float64(totalWindows)*100),
		Severity: Warning,
	}}
}
