// Command probe is a developer utility that parses and prints EDF file
// metadata for a hard-coded set of paths on a mounted ResMed SD card.
// It is not part of the production binary — use it to inspect raw signal
// headers and per-signal statistics during development.
package main

import (
	"fmt"
	"log"
	"time"
	"github.com/somnatrace/somnatrace/internal/edf"
)

func main() {
	files := []string{
		"/Volumes/RESMED/DATALOG/20260612/20260612_161010_PLD.edf",
		"/Volumes/RESMED/DATALOG/20260612/20260612_161010_BRP.edf",
		"/Volumes/RESMED/DATALOG/20260612/20260612_161010_SA2.edf",
	}
	for _, path := range files {
		f, err := edf.ReadFile(path, time.Local)
		if err != nil {
			log.Printf("error %s: %v", path, err)
			continue
		}
		fmt.Printf("\n=== %s ===\n", path)
		fmt.Printf("Start: %s, Records: %d, Duration: %.1fs\n",
			f.Header.StartTime.Format(time.RFC3339), f.Header.NumDataRecords, f.Header.DurationSec)
		for i, sig := range f.Signals {
			p50, p95, pmax := f.Stats(i)
			fmt.Printf("  [%d] %-30s  ns=%d  phys=[%.2f,%.2f]  p50=%.2f p95=%.2f max=%.2f\n",
				i, sig.Label, len(sig.Samples), sig.PhysMin, sig.PhysMax, p50, p95, pmax)
		}
	}
}
