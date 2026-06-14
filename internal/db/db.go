// Package db manages the SQLite connection and schema migrations.
// It wraps database/sql with a pure-Go driver (modernc.org/sqlite) so the
// binary compiles without CGo. WAL mode is enabled at connection time for
// better read/write concurrency.
package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// DB wraps sql.DB and carries the file path so helpers like Stats can
// measure the on-disk size of the database and its WAL sidecar files.
type DB struct {
	*sql.DB
	Path string
}

// Open creates the data directory if necessary, opens the SQLite database at
// path, verifies the connection, and applies WAL-mode pragmas.
func Open(path string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := conn.Ping(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	d := &DB{DB: conn, Path: path}
	if err := d.applyPragmas(); err != nil {
		conn.Close()
		return nil, err
	}

	return d, nil
}

// applyPragmas sets WAL journal mode and other recommended SQLite settings.
// These must be applied on every new connection because SQLite pragmas are
// not persisted as part of the database file.
func (d *DB) applyPragmas() error {
	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
		"PRAGMA synchronous=NORMAL",
	}
	for _, p := range pragmas {
		if _, err := d.Exec(p); err != nil {
			return fmt.Errorf("pragma %q: %w", p, err)
		}
	}
	return nil
}
