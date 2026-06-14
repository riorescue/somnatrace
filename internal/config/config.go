// Package config loads application settings from environment variables and
// exposes them through a single Config struct. All fields have sensible
// defaults so the server starts correctly with no environment configuration.
package config

import (
	"fmt"
	"os"
	"path/filepath"
)

// Version is the application's semantic version string, embedded at compile time.
const Version = "0.1.0"

// Config holds all runtime configuration values read from the environment.
type Config struct {
	Host    string // bind address (SOMNATRACE_HOST)
	Port    string // listen port (SOMNATRACE_PORT)
	DataDir string // directory that contains the database file (SOMNATRACE_DATA_DIR)
	DBPath  string // full path to the SQLite database file (SOMNATRACE_DB_PATH)
	Mode    string // "development" or "production" (SOMNATRACE_MODE)
}

// Load reads configuration from environment variables and returns a Config
// populated with default values for any variable that is not set.
func Load() *Config {
	dataDir := getEnv("SOMNATRACE_DATA_DIR", defaultDataDir())
	return &Config{
		Host:    getEnv("SOMNATRACE_HOST", "127.0.0.1"),
		Port:    getEnv("SOMNATRACE_PORT", "8080"),
		DataDir: dataDir,
		DBPath:  getEnv("SOMNATRACE_DB_PATH", filepath.Join(dataDir, "somnatrace.db")),
		Mode:    getEnv("SOMNATRACE_MODE", "development"),
	}
}

// ListenAddr returns the "host:port" string used to bind the HTTP server.
func (c *Config) ListenAddr() string {
	return fmt.Sprintf("%s:%s", c.Host, c.Port)
}

// IsDev reports whether the server is running in development mode.
// In dev mode the embedded frontend is not served; Vite handles the UI instead.
func (c *Config) IsDev() bool {
	return c.Mode == "development"
}

// defaultDataDir returns ~/.somnatrace, or ./data if the home directory
// cannot be determined.
func defaultDataDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "./data"
	}
	return filepath.Join(home, ".somnatrace")
}

// getEnv returns the value of the environment variable named by key, or
// fallback if the variable is unset or empty.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
