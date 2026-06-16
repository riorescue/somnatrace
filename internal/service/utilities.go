// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

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
	"github.com/somnatrace/somnatrace/internal/machine"
	"github.com/somnatrace/somnatrace/internal/models"
)

var backupIDPattern = regexp.MustCompile(`^\d{8}-\d{6}$`)

// restoreTables is the canonical ordered list of tables to clear and repopulate
// during a restore. Order respects foreign-key dependencies (parents before
// children for INSERT, but DELETE is done inside a single transaction with
// foreign_keys=OFF so ordering there is just for clarity).
var restoreTables = []string{
	"devices",
	"imports",
	"sessions",
	"daily_summaries",
	"events",
	"session_signals",
	"session_findings",
	"settings_snapshots",
	"device_identification_snapshots",
	"app_settings",
	"rule_settings",
	"schema_migrations",
}

// UtilitiesService exposes maintenance operations: database statistics,
// bulk data deletion, WAL vacuuming, and storage media detection.
type UtilitiesService struct {
	db *db.DB
}

// schemaVersionFromDB reads the latest applied migration version from an open
// sql.DB. Returns an empty string if the schema_migrations table does not exist.
func schemaVersionFromDB(d *sql.DB) string {
	var v string
	_ = d.QueryRow(`SELECT COALESCE(MAX(version),'') FROM schema_migrations`).Scan(&v)
	return v
}

// schemaVersionFromFile opens a SQLite file at path (read-only) and returns its
// latest applied migration version. Returns empty string on any error.
func schemaVersionFromFile(path string) string {
	conn, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		return ""
	}
	defer conn.Close()
	v := schemaVersionFromDB(conn)
	return v
}

// Stats returns per-table row counts, the total on-disk size of the database
// (main file + WAL + SHM sidecar files), and the current schema version.
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

	var sizeBytes int64
	for _, suffix := range []string{"", "-wal", "-shm"} {
		if fi, err := os.Stat(s.db.Path + suffix); err == nil {
			sizeBytes += fi.Size()
		}
	}

	return &models.DbStats{
		Counts:        counts,
		SizeBytes:     sizeBytes,
		SchemaVersion: schemaVersionFromDB(s.db.DB),
	}, nil
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

// DetectCards scans mounted volumes for directories that match a known device
// family signature. Each candidate is probed with DefaultDetector; volumes with
// an unrecognised layout are silently skipped.
func (s *UtilitiesService) DetectCards() ([]models.DetectedCard, error) {
	detector := &machine.DefaultDetector{}
	candidates := mountCandidates()
	var found []models.DetectedCard
	for _, path := range candidates {
		family, err := detector.Detect(path)
		if err != nil || family == models.DeviceFamilyUnknown {
			continue
		}
		found = append(found, models.DetectedCard{Path: path, Family: family})
	}
	return found, nil
}

// mountCandidates returns a list of directories to probe for device data.
// On macOS, /Volumes/<label> is the standard mount point for removable media.
func mountCandidates() []string {
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
	return &models.Backup{
		ID:            id,
		CreatedAt:     fi.ModTime(),
		SizeBytes:     fi.Size(),
		SchemaVersion: schemaVersionFromDB(s.db.DB),
	}, nil
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
		backupPath := filepath.Join(s.backupDir(), name)
		backups = append(backups, models.Backup{
			ID:            id,
			CreatedAt:     fi.ModTime(),
			SizeBytes:     fi.Size(),
			SchemaVersion: schemaVersionFromFile(backupPath),
		})
	}
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].CreatedAt.After(backups[j].CreatedAt)
	})
	return backups, nil
}

// RestoreBackup replaces all current data with the contents of the named backup.
// It uses SQL ATTACH so no server restart is required. If the backup was created
// at a different schema version, only the columns common to both schemas are
// copied; db.Migrate is then called to bring the schema up to date.
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

	if restoreErr != nil {
		return restoreErr
	}

	// Apply any migrations that postdate the backup's schema version.
	return s.db.Migrate()
}

// tableColumns returns the column names for table in the given schema ("main"
// or "bk") using PRAGMA table_info. Returns nil if the table does not exist.
func tableColumns(ctx context.Context, tx *sql.Tx, schema, table string) ([]string, error) {
	rows, err := tx.QueryContext(ctx, fmt.Sprintf(`PRAGMA %s.table_info(%s)`, schema, table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cols []string
	for rows.Next() {
		var cid int
		var name, typ string
		var notNull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &typ, &notNull, &dflt, &pk); err != nil {
			return nil, err
		}
		cols = append(cols, name)
	}
	return cols, rows.Err()
}

// columnIntersection returns the columns that exist in both sets, preserving
// the order from mainCols.
func columnIntersection(mainCols, bkCols []string) []string {
	bkSet := make(map[string]bool, len(bkCols))
	for _, c := range bkCols {
		bkSet[c] = true
	}
	var common []string
	for _, c := range mainCols {
		if bkSet[c] {
			common = append(common, c)
		}
	}
	return common
}

func restoreFromAttached(ctx context.Context, conn *sql.Conn) error {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, t := range restoreTables {
		if _, err := tx.ExecContext(ctx, `DELETE FROM main.`+t); err != nil {
			if strings.Contains(err.Error(), "no such table") {
				continue
			}
			return fmt.Errorf("clear %s: %w", t, err)
		}

		// Build an explicit column list from the intersection of the live schema
		// and the backup schema so that added or removed columns never cause a
		// column-count mismatch on INSERT.
		mainCols, err := tableColumns(ctx, tx, "main", t)
		if err != nil || len(mainCols) == 0 {
			continue
		}
		bkCols, err := tableColumns(ctx, tx, "bk", t)
		if err != nil || len(bkCols) == 0 {
			continue
		}
		cols := columnIntersection(mainCols, bkCols)
		if len(cols) == 0 {
			continue
		}

		colList := strings.Join(cols, ", ")
		q := fmt.Sprintf(`INSERT OR IGNORE INTO main.%s (%s) SELECT %s FROM bk.%s`, t, colList, colList, t)
		if _, err := tx.ExecContext(ctx, q); err != nil {
			return fmt.Errorf("restore %s: %w", t, err)
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
