package service

import (
	"fmt"
	"os"

	"github.com/somnatrace/somnatrace/internal/db"
	"github.com/somnatrace/somnatrace/internal/models"
)

// UtilitiesService exposes maintenance operations: database statistics,
// bulk data deletion, WAL vacuuming, and SD card detection.
type UtilitiesService struct {
	db *db.DB
}

// Stats returns per-table row counts and the total on-disk size of the database
// (main file + WAL + SHM sidecar files).
func (s *UtilitiesService) Stats() (*models.DbStats, error) {
	counts := map[string]int{}
	tables := []string{"devices", "imports", "sessions", "daily_summaries", "events", "session_signals"}

	for _, t := range tables {
		var n int
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM ` + t).Scan(&n); err != nil {
			return nil, fmt.Errorf("count %s: %w", t, err)
		}
		counts[t] = n
	}

	// Sum the main DB file plus any WAL/SHM sidecar files.
	var sizeBytes int64
	for _, suffix := range []string{"", "-wal", "-shm"} {
		if fi, err := os.Stat(s.db.Path + suffix); err == nil {
			sizeBytes += fi.Size()
		}
	}

	return &models.DbStats{Counts: counts, SizeBytes: sizeBytes}, nil
}

// DeleteAll removes all user data rows while preserving the schema.
// Tables are cleared in foreign-key-safe order so no constraint violations occur.
func (s *UtilitiesService) DeleteAll() error {
	tables := []string{
		"session_findings",
		"session_signals",
		"events",
		"daily_summaries",
		"sessions",
		"imports",
		"devices",
		"settings_snapshots",
		"device_identification_snapshots",
	}
	for _, t := range tables {
		if _, err := s.db.Exec(`DELETE FROM ` + t); err != nil {
			return fmt.Errorf("delete %s: %w", t, err)
		}
	}
	return nil
}

// Vacuum checkpoints the WAL file and runs VACUUM to reclaim free pages and
// defragment the database file. This is safe to call while the server is running.
func (s *UtilitiesService) Vacuum() error {
	if _, err := s.db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		return fmt.Errorf("checkpoint: %w", err)
	}
	if _, err := s.db.Exec(`VACUUM`); err != nil {
		return fmt.Errorf("vacuum: %w", err)
	}
	return nil
}

// DetectResMedCards scans mounted volumes for directories that contain
// Identification.json, which indicates a ResMed SD card.
func (s *UtilitiesService) DetectResMedCards() ([]models.DetectedCard, error) {
	candidates := resmedMountCandidates()
	var found []models.DetectedCard
	for _, path := range candidates {
		if _, err := os.Stat(path + "/Identification.json"); err == nil {
			found = append(found, models.DetectedCard{Path: path})
		}
	}
	return found, nil
}

// resmedMountCandidates returns a list of directories to probe for SD cards.
// On macOS, /Volumes/<label> is the standard mount point for removable media.
func resmedMountCandidates() []string {
	entries, err := os.ReadDir("/Volumes")
	if err != nil {
		return nil
	}
	var paths []string
	for _, e := range entries {
		if e.IsDir() {
			paths = append(paths, "/Volumes/"+e.Name())
		}
	}
	return paths
}
