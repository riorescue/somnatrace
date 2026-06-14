package analysis

import (
	"fmt"

	"github.com/somnatrace/somnatrace/internal/models"
)

// FL-01: flow_lim > 0.10 for >= 2 continuous minutes (60 samples at 2 s).
// Mild inspiratory flattening — UARS / sub-RERA territory.
type MildFlowLimitationRule struct{}

func (r *MildFlowLimitationRule) ID() string { return "FL-01" }

func (r *MildFlowLimitationRule) Analyze(signals *models.SessionSignals) []Finding {
	runs := findRuns(signals.FlowLim, 0.10, 60)
	var findings []Finding
	for _, run := range runs {
		dur := signals.FlowLim[run[1]].T - signals.FlowLim[run[0]].T + 2
		findings = append(findings, Finding{
			RuleID:   r.ID(),
			Title:    "Mild Flow Limitation",
			Detail:   fmt.Sprintf("Inspiratory flow flattening index exceeded 0.10 for %.0f seconds. Mild flow limitation may contribute to sleep fragmentation even without scoreable apneas or hypopneas (Upper Airway Resistance Syndrome territory).", dur),
			Severity: Info,
			StartSec: ptr(signals.FlowLim[run[0]].T),
			EndSec:   ptr(signals.FlowLim[run[1]].T),
		})
	}
	return findings
}

// FL-02: flow_lim > 0.25 for >= 60 s (30 samples at 2 s).
// Moderate obstruction — probable RERA. Validated by Hosselet et al. (2001).
type ModerateFlowLimitationRule struct{}

func (r *ModerateFlowLimitationRule) ID() string { return "FL-02" }

func (r *ModerateFlowLimitationRule) Analyze(signals *models.SessionSignals) []Finding {
	runs := findRuns(signals.FlowLim, 0.25, 30)
	var findings []Finding
	for _, run := range runs {
		dur := signals.FlowLim[run[1]].T - signals.FlowLim[run[0]].T + 2
		findings = append(findings, Finding{
			RuleID:   r.ID(),
			Title:    "Moderate Flow Limitation / Probable RERA",
			Detail:   fmt.Sprintf("Significant inspiratory flattening (index >0.25) for %.0f seconds. Per published literature (Hosselet et al. 2001, AJRCCM), this level correlates with respiratory effort-related arousals (RERAs) and sleep fragmentation, even when AHI appears controlled.", dur),
			Severity: Warning,
			StartSec: ptr(signals.FlowLim[run[0]].T),
			EndSec:   ptr(signals.FlowLim[run[1]].T),
		})
	}
	return findings
}

// FL-03: flow_lim > 0.40 for >= 30 s (15 samples at 2 s).
// Severe obstruction — APAP should be responding with pressure increase.
type SevereFlowLimitationRule struct{}

func (r *SevereFlowLimitationRule) ID() string { return "FL-03" }

func (r *SevereFlowLimitationRule) Analyze(signals *models.SessionSignals) []Finding {
	runs := findRuns(signals.FlowLim, 0.40, 15)
	var findings []Finding
	for _, run := range runs {
		dur := signals.FlowLim[run[1]].T - signals.FlowLim[run[0]].T + 2
		findings = append(findings, Finding{
			RuleID:   r.ID(),
			Title:    "Severe Flow Limitation",
			Detail:   fmt.Sprintf("Severe inspiratory flattening (index >0.40) detected for %.0f seconds. This indicates strong upper airway obstruction. An APAP device should respond with a pressure increase — absence of response suggests a pressure ceiling or therapy setting issue.", dur),
			Severity: Alert,
			StartSec: ptr(signals.FlowLim[run[0]].T),
			EndSec:   ptr(signals.FlowLim[run[1]].T),
		})
	}
	return findings
}

// FL-04: session-level flow limitation burden (% of session with index > 0.25).
// Thresholds: 5–15% → Warning, >15% → Alert, >30% → Critical.
type FlowLimitationBurdenRule struct{}

func (r *FlowLimitationBurdenRule) ID() string { return "FL-04" }

func (r *FlowLimitationBurdenRule) Analyze(signals *models.SessionSignals) []Finding {
	if len(signals.FlowLim) == 0 {
		return nil
	}
	above := 0
	for _, p := range signals.FlowLim {
		if p.V > 0.25 {
			above++
		}
	}
	pct := float64(above) / float64(len(signals.FlowLim)) * 100

	var sev Severity
	var detail string
	switch {
	case pct > 30:
		sev = Critical
		detail = fmt.Sprintf("%.0f%% of the session had significant flow limitation (index >0.25). This severe cumulative burden indicates persistent upper airway obstruction throughout the night, strongly associated with poor sleep quality and inadequate therapy.", pct)
	case pct > 15:
		sev = Alert
		detail = fmt.Sprintf("%.0f%% of the session had significant flow limitation (index >0.25). This level of obstruction burden correlates with sleep fragmentation and daytime symptoms even when AHI appears controlled.", pct)
	case pct > 5:
		sev = Warning
		detail = fmt.Sprintf("%.0f%% of the session had significant flow limitation (index >0.25). Mild-to-moderate cumulative obstruction. Consider reviewing pressure settings and mask fit.", pct)
	default:
		return nil
	}

	return []Finding{{
		RuleID:   r.ID(),
		Title:    "Flow Limitation Burden",
		Detail:   detail,
		Severity: sev,
	}}
}

// FL-05: flow_lim > 0.30 for >= 2 min with no corresponding pressure rise.
// Indicates APAP is not responding — possible fixed mode or pressure ceiling.
type FlowLimitationNoResponseRule struct{}

func (r *FlowLimitationNoResponseRule) ID() string { return "FL-05" }

func (r *FlowLimitationNoResponseRule) Analyze(signals *models.SessionSignals) []Finding {
	const flThreshold = 0.30
	const minSamples = 60      // 2 min at 2 s
	const slopeThreshold = 0.1 // cmH₂O/min

	pts := signals.FlowLim
	prs := signals.Pressure

	// Build pressure lookup by timestamp.
	pressureAt := make(map[float64]float64, len(prs))
	for _, p := range prs {
		pressureAt[p.T] = p.V
	}

	var findings []Finding
	i := 0
	for i < len(pts) {
		if pts[i].V > flThreshold {
			j := i
			for j < len(pts) && pts[j].V > flThreshold {
				j++
			}
			runLen := j - i
			if runLen >= minSamples {
				startT := pts[i].T
				endT := pts[j-1].T

				quarter := runLen / 4
				if quarter < 1 {
					quarter = 1
				}
				pStart, pEnd, countS, countE := 0.0, 0.0, 0, 0
				for k := i; k < i+quarter; k++ {
					if v, ok := pressureAt[pts[k].T]; ok {
						pStart += v
						countS++
					}
				}
				for k := j - quarter; k < j; k++ {
					if v, ok := pressureAt[pts[k].T]; ok {
						pEnd += v
						countE++
					}
				}
				if countS > 0 {
					pStart /= float64(countS)
				}
				if countE > 0 {
					pEnd /= float64(countE)
				}

				durationMin := (endT - startT) / 60.0
				if durationMin < 0.01 {
					durationMin = 0.01
				}
				slope := (pEnd - pStart) / durationMin

				if slope < slopeThreshold {
					findings = append(findings, Finding{
						RuleID:   r.ID(),
						Title:    "Flow Limitation Without Pressure Response",
						Detail:   fmt.Sprintf("Significant inspiratory flattening (index >0.30) persisted for %.0f minutes without a corresponding pressure increase from the device. APAP therapy should respond to sustained obstruction with a pressure increase. Absence of response suggests fixed CPAP mode, a pressure ceiling, or insufficient device sensitivity.", durationMin),
						Severity: Warning,
						StartSec: ptr(startT),
						EndSec:   ptr(endT),
					})
				}
			}
			i = j
		} else {
			i++
		}
	}
	return findings
}
