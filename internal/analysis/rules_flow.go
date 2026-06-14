package analysis

import (
	"fmt"
	"math"

	"github.com/somnatrace/somnatrace/internal/models"
)

// F-01: Probable Apnea — |flow| < 10% of rolling 2-minute baseline for >= 10 s.
// AASM definition: >= 90% amplitude drop for >= 10 s. Classified as "probable"
// because SpO₂ data is unavailable to confirm desaturation.
type ProbableApneaRule struct{}

func (r *ProbableApneaRule) ID() string { return "F-01" }

func (r *ProbableApneaRule) Analyze(signals *models.SessionSignals) []Finding {
	pts := signals.Flow
	if len(pts) < 10 {
		return nil
	}

	const baselineWindow = 120 // 2-minute rolling window at 1 Hz
	const minSamples = 10      // 10 s minimum duration (AASM)
	const maxSamples = 90      // 90 s maximum (longer likely artifact)
	const minBaseline = 0.10   // L/s — skip if baseline too low to be meaningful
	const apneaFraction = 0.10 // < 10% of baseline = apnea

	baselines := rollingBaseline(pts, baselineWindow)

	var findings []Finding
	i := 0
	for i < len(pts) {
		bl := baselines[i]
		if bl < minBaseline {
			i++
			continue
		}
		if math.Abs(pts[i].V) < bl*apneaFraction {
			j := i
			for j < len(pts) {
				bl2 := baselines[j]
				if bl2 >= minBaseline && math.Abs(pts[j].V) < bl2*apneaFraction {
					j++
				} else {
					break
				}
			}
			duration := j - i
			if duration >= minSamples && duration <= maxSamples {
				findings = append(findings, Finding{
					RuleID:   r.ID(),
					Title:    "Probable Apnea",
					Detail:   fmt.Sprintf("Airflow amplitude dropped to less than 10%% of baseline for %d seconds (AASM criterion: ≥90%% reduction for ≥10 s). Classified as probable because SpO₂ is not available to confirm desaturation.", duration),
					Severity: Alert,
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

// F-02: Probable Hypopnea — |flow| at 10–50% of rolling baseline for >= 10 s.
// AASM: >= 30% reduction for >= 10 s. Using 50% threshold (conservative) to
// reduce false positives without SpO₂ data. Apnea windows (< 10% baseline)
// are excluded so F-01 and F-02 do not double-count the same event.
type ProbableHypopneaRule struct{}

func (r *ProbableHypopneaRule) ID() string { return "F-02" }

func (r *ProbableHypopneaRule) Analyze(signals *models.SessionSignals) []Finding {
	pts := signals.Flow
	if len(pts) < 10 {
		return nil
	}

	const baselineWindow = 120
	const minSamples = 10
	const minBaseline = 0.10
	const lowerFraction = 0.10 // below this is apnea territory
	const upperFraction = 0.50 // above this is normal flow

	baselines := rollingBaseline(pts, baselineWindow)

	var findings []Finding
	i := 0
	for i < len(pts) {
		bl := baselines[i]
		if bl < minBaseline {
			i++
			continue
		}
		frac := math.Abs(pts[i].V) / bl
		if frac >= lowerFraction && frac < upperFraction {
			j := i
			for j < len(pts) {
				bl2 := baselines[j]
				if bl2 < minBaseline {
					break
				}
				f2 := math.Abs(pts[j].V) / bl2
				if f2 >= lowerFraction && f2 < upperFraction {
					j++
				} else {
					break
				}
			}
			if j-i >= minSamples {
				findings = append(findings, Finding{
					RuleID:   r.ID(),
					Title:    "Probable Hypopnea",
					Detail:   fmt.Sprintf("Airflow amplitude was 50–90%% reduced from baseline for %d seconds, meeting the pattern of hypopnea per AASM criteria. SpO₂ data is unavailable to confirm desaturation, so this is classified as probable.", j-i),
					Severity: Warning,
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
