package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/somnatrace/somnatrace/internal/db"
	"github.com/somnatrace/somnatrace/internal/models"
)

var backupIDPattern = regexp.MustCompile(`^\d{8}-\d{6}$`)

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

// backupDir returns the directory where database backups are stored.
func (s *UtilitiesService) backupDir() string {
	return filepath.Join(filepath.Dir(s.db.Path), "backups")
}

// CreateBackup checkpoints the WAL and writes a clean copy of the database to
// the backups directory using VACUUM INTO. Returns the new backup's metadata.
func (s *UtilitiesService) CreateBackup() (*models.Backup, error) {
	if err := os.MkdirAll(s.backupDir(), 0755); err != nil {
		return nil, fmt.Errorf("create backup dir: %w", err)
	}

	id := time.Now().Format("20060102-150405")
	dest := filepath.Join(s.backupDir(), "somnatrace-"+id+".db")

	if _, err := s.db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
		return nil, fmt.Errorf("checkpoint: %w", err)
	}
	if _, err := s.db.Exec(`VACUUM INTO ?`, dest); err != nil {
		return nil, fmt.Errorf("vacuum into: %w", err)
	}

	fi, err := os.Stat(dest)
	if err != nil {
		return nil, fmt.Errorf("stat backup: %w", err)
	}
	return &models.Backup{ID: id, CreatedAt: fi.ModTime(), SizeBytes: fi.Size()}, nil
}

// ListBackups returns all backup snapshots in the backups directory, newest first.
func (s *UtilitiesService) ListBackups() ([]models.Backup, error) {
	entries, err := os.ReadDir(s.backupDir())
	if os.IsNotExist(err) {
		return []models.Backup{}, nil
	}
	if err != nil {
		return nil, err
	}

	var backups []models.Backup
	for _, e := range entries {
		name := e.Name()
		if !strings.HasPrefix(name, "somnatrace-") || !strings.HasSuffix(name, ".db") {
			continue
		}
		id := strings.TrimSuffix(strings.TrimPrefix(name, "somnatrace-"), ".db")
		if !backupIDPattern.MatchString(id) {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		backups = append(backups, models.Backup{ID: id, CreatedAt: fi.ModTime(), SizeBytes: fi.Size()})
	}
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].CreatedAt.After(backups[j].CreatedAt)
	})
	return backups, nil
}

// RestoreBackup replaces all current data with the contents of the named backup.
// It uses SQL ATTACH so no server restart is required.
func (s *UtilitiesService) RestoreBackup(id string) error {
	if !backupIDPattern.MatchString(id) {
		return fmt.Errorf("invalid backup id")
	}
	src := filepath.Join(s.backupDir(), "somnatrace-"+id+".db")
	if _, err := os.Stat(src); os.IsNotExist(err) {
		return fmt.Errorf("backup not found: %s", id)
	}

	ctx := context.Background()
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("get conn: %w", err)
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys=OFF`); err != nil {
		return err
	}
	if _, err := conn.ExecContext(ctx, `ATTACH DATABASE ? AS bk`, src); err != nil {
		conn.ExecContext(ctx, `PRAGMA foreign_keys=ON`)
		return fmt.Errorf("attach: %w", err)
	}

	restoreErr := restoreFromAttached(ctx, conn)

	conn.ExecContext(ctx, `DETACH DATABASE bk`)
	conn.ExecContext(ctx, `PRAGMA foreign_keys=ON`)
	return restoreErr
}

func restoreFromAttached(ctx context.Context, conn *sql.Conn) error {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	tables := []string{
		"devices", "imports", "sessions", "daily_summaries",
		"events", "session_signals", "session_findings",
		"settings_snapshots", "device_identification_snapshots",
		"app_settings", "rule_settings",
	}
	for _, t := range tables {
		if _, err := tx.ExecContext(ctx, `DELETE FROM main.`+t); err != nil {
			return fmt.Errorf("clear %s: %w", t, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO main.`+t+` SELECT * FROM bk.`+t); err != nil {
			if !strings.Contains(err.Error(), "no such table") {
				return fmt.Errorf("restore %s: %w", t, err)
			}
		}
	}
	return tx.Commit()
}

// DeleteBackup removes a backup snapshot file from disk.
func (s *UtilitiesService) DeleteBackup(id string) error {
	if !backupIDPattern.MatchString(id) {
		return fmt.Errorf("invalid backup id")
	}
	path := filepath.Join(s.backupDir(), "somnatrace-"+id+".db")
	if err := os.Remove(path); os.IsNotExist(err) {
		return fmt.Errorf("backup not found: %s", id)
	} else if err != nil {
		return fmt.Errorf("remove: %w", err)
	}
	return nil
}
