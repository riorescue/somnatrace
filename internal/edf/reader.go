// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package edf

import (
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

// File is a fully decoded EDF or EDF+ file.
type File struct {
	Header  Header
	Signals []Signal
}

// SignalByLabel returns the first signal whose label matches (case-insensitive prefix).
func (f *File) SignalByLabel(label string) (*Signal, bool) {
	label = strings.ToLower(label)
	for i := range f.Signals {
		if strings.HasPrefix(strings.ToLower(f.Signals[i].Label), label) {
			return &f.Signals[i], true
		}
	}
	return nil, false
}

// Stats computes percentiles over all decoded samples for a signal index.
// Returns p50, p95, and max values.
func (f *File) Stats(idx int) (p50, p95, pmax float64) {
	if idx < 0 || idx >= len(f.Signals) {
		return
	}
	return percentiles(f.Signals[idx].Samples)
}

// ReadFile opens and fully parses an EDF or EDF+ file.
// Timestamps in the EDF header are interpreted in loc.
func ReadFile(path string, loc *time.Location) (*File, error) {
	fh, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("edf: open %s: %w", path, err)
	}
	defer fh.Close()
	return Read(fh, loc)
}

// Read parses an EDF file from r.
// loc is the timezone used to interpret the EDF header start date/time.
func Read(r io.Reader, loc *time.Location) (*File, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("edf: read: %w", err)
	}
	if len(raw) < 256 {
		return nil, ErrInvalidHeader
	}

	h, err := parseHeader(raw, loc)
	if err != nil {
		return nil, err
	}

	ns := h.NumSignals
	sigHeaderBytes := ns * 256
	if len(raw) < 256+sigHeaderBytes {
		return nil, ErrTruncated
	}

	signals, err := parseSignalHeaders(raw[256:], ns)
	if err != nil {
		return nil, err
	}

	f := &File{Header: h, Signals: signals}

	if h.NumDataRecords > 0 {
		if err := decodeDataRecords(raw, h, signals); err != nil {
			return nil, err
		}
	}

	return f, nil
}

func parseHeader(raw []byte, loc *time.Location) (Header, error) {
	field := func(start, end int) string {
		return strings.TrimSpace(string(raw[start:end]))
	}

	ns, err := strconv.Atoi(field(252, 256))
	if err != nil {
		return Header{}, fmt.Errorf("edf: num signals: %w", err)
	}
	nrec, err := strconv.Atoi(field(236, 244))
	if err != nil {
		return Header{}, fmt.Errorf("edf: num records: %w", err)
	}
	dur, err := strconv.ParseFloat(field(244, 252), 64)
	if err != nil {
		return Header{}, fmt.Errorf("edf: duration: %w", err)
	}
	nbh, _ := strconv.Atoi(field(184, 192))

	reserved := field(192, 236)
	isPlus := strings.HasPrefix(reserved, "EDF+")
	isDisc := reserved == "EDF+D"

	startDate := field(168, 176)
	startTime := field(176, 184)

	// EDF dates use 2-digit years: interpret 85-99 as 1985-1999, 00-84 as 2000-2084.
	t, err := parseEDFTime(startDate, startTime, loc)
	if err != nil {
		return Header{}, fmt.Errorf("edf: start time: %w", err)
	}

	return Header{
		Version:         field(0, 8),
		LocalPatient:    field(8, 88),
		LocalRecording:  field(88, 168),
		StartTime:       t,
		NumBytesHeader:  nbh,
		Reserved:        reserved,
		IsEDFPlus:       isPlus,
		IsDiscontinuous: isDisc,
		NumDataRecords:  nrec,
		DurationSec:     dur,
		NumSignals:      ns,
	}, nil
}

func parseSignalHeaders(raw []byte, ns int) ([]Signal, error) {
	get := func(offset, size int) []string {
		out := make([]string, ns)
		for i := range out {
			out[i] = strings.TrimSpace(string(raw[offset+i*size : offset+i*size+size]))
		}
		return out
	}
	getFloat := func(offset int) []float64 {
		strs := get(offset, 8)
		out := make([]float64, ns)
		for i, s := range strs {
			out[i], _ = strconv.ParseFloat(s, 64)
		}
		return out
	}
	getInt := func(offset int) []int {
		strs := get(offset, 8)
		out := make([]int, ns)
		for i, s := range strs {
			out[i], _ = strconv.Atoi(s)
		}
		return out
	}

	labels    := get(0, 16)
	transducer := get(ns*16, 80)
	physDim   := get(ns*16+ns*80, 8)
	physMin   := getFloat(ns*16 + ns*80 + ns*8)
	physMax   := getFloat(ns*16 + ns*80 + ns*8*2)
	digMin    := getInt(ns*16 + ns*80 + ns*8*3)
	digMax    := getInt(ns*16 + ns*80 + ns*8*4)
	prefilt   := get(ns*16+ns*80+ns*8*5, 80)
	nSamples  := getInt(ns*16 + ns*80*2 + ns*8*5)

	signals := make([]Signal, ns)
	for i := range signals {
		signals[i] = Signal{
			Label:      labels[i],
			Transducer: transducer[i],
			PhysDim:    physDim[i],
			PhysMin:    physMin[i],
			PhysMax:    physMax[i],
			DigMin:     digMin[i],
			DigMax:     digMax[i],
			Prefiltering: prefilt[i],
			NSamples:   nSamples[i],
		}
	}
	return signals, nil
}

func decodeDataRecords(raw []byte, h Header, signals []Signal) error {
	headerSize := h.NumBytesHeader
	offset := headerSize

	// Pre-compute per-signal gain/offset for digital→physical conversion.
	type scaler struct{ gain, off float64 }
	scalers := make([]scaler, len(signals))
	for i, s := range signals {
		rng := float64(s.DigMax - s.DigMin)
		if rng == 0 {
			scalers[i] = scaler{0, s.PhysMin}
		} else {
			g := (s.PhysMax - s.PhysMin) / rng
			scalers[i] = scaler{g, s.PhysMin - g*float64(s.DigMin)}
		}
	}

	for i := range signals {
		signals[i].Samples = make([]float64, 0, signals[i].NSamples*h.NumDataRecords)
	}

	for rec := 0; rec < h.NumDataRecords; rec++ {
		for i, sig := range signals {
			n := sig.NSamples
			need := offset + n*2
			if need > len(raw) {
				return ErrTruncated
			}
			sc := scalers[i]
			for j := 0; j < n; j++ {
				dig := int16(binary.LittleEndian.Uint16(raw[offset+j*2:]))
				signals[i].Samples = append(signals[i].Samples, float64(dig)*sc.gain+sc.off)
			}
			offset += n * 2
		}
	}
	return nil
}

// parseEDFTime parses the EDF header date "DD.MM.YY" and time "HH.MM.SS"
// into a time.Time in loc. Years 00–84 map to 2000–2084; 85–99 to 1985–1999.
func parseEDFTime(date, timeStr string, loc *time.Location) (time.Time, error) {
	if loc == nil {
		loc = time.Local
	}
	combined := date + " " + timeStr
	t, err := time.ParseInLocation("02.01.06 15.04.05", combined, loc)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse %q: %w", combined, err)
	}
	return t, nil
}

// percentiles returns the p50, p95, and max of vals.
func percentiles(vals []float64) (p50, p95, pmax float64) {
	if len(vals) == 0 {
		return
	}
	sorted := make([]float64, len(vals))
	copy(sorted, vals)
	sort.Float64s(sorted)

	p50 = pctile(sorted, 50)
	p95 = pctile(sorted, 95)
	pmax = sorted[len(sorted)-1]
	return
}

func pctile(sorted []float64, p float64) float64 {
	n := len(sorted)
	if n == 0 {
		return 0
	}
	idx := p / 100.0 * float64(n-1)
	lo := int(math.Floor(idx))
	hi := int(math.Ceil(idx))
	if lo == hi {
		return sorted[lo]
	}
	frac := idx - float64(lo)
	return sorted[lo]*(1-frac) + sorted[hi]*frac
}
