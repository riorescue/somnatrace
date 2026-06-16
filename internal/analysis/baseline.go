// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package analysis

import (
	"math"
	"sort"

	"github.com/riorescue/somnatrace/internal/models"
)

// rollingBaseline computes the mean absolute value of flow over a sliding
// backward window. Returns 0 for indices where fewer than 10 prior samples
// exist (callers should skip those points).
func rollingBaseline(pts []models.SignalPoint, windowSamples int) []float64 {
	out := make([]float64, len(pts))
	for i := range pts {
		start := i - windowSamples
		if start < 0 {
			start = 0
		}
		sum, count := 0.0, 0
		for j := start; j < i; j++ {
			sum += math.Abs(pts[j].V)
			count++
		}
		if count < 10 {
			out[i] = 0
		} else {
			out[i] = sum / float64(count)
		}
	}
	return out
}

// percentile returns the p-th percentile of signal values (p in [0, 1]).
func percentile(pts []models.SignalPoint, p float64) float64 {
	if len(pts) == 0 {
		return 0
	}
	vals := make([]float64, len(pts))
	for i, pt := range pts {
		vals[i] = pt.V
	}
	sort.Float64s(vals)
	idx := int(float64(len(vals)) * p)
	if idx >= len(vals) {
		idx = len(vals) - 1
	}
	return vals[idx]
}

func median(pts []models.SignalPoint) float64 { return percentile(pts, 0.5) }

func ptr(f float64) *float64 { return &f }

// findRuns returns [start, end] index pairs of runs where pts[i].V > threshold
// lasting at least minSamples consecutive samples.
func findRuns(pts []models.SignalPoint, threshold float64, minSamples int) [][2]int {
	return findRunsPred(pts, func(v float64) bool { return v > threshold }, minSamples)
}

// findRunsPred is the general form of findRuns using an arbitrary predicate.
func findRunsPred(pts []models.SignalPoint, pred func(float64) bool, minSamples int) [][2]int {
	var runs [][2]int
	i := 0
	for i < len(pts) {
		if pred(pts[i].V) {
			j := i
			for j < len(pts) && pred(pts[j].V) {
				j++
			}
			if j-i >= minSamples {
				runs = append(runs, [2]int{i, j - 1})
			}
			i = j
		} else {
			i++
		}
	}
	return runs
}
