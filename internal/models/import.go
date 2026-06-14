package models

import "time"

// ImportStatus describes the lifecycle stage of an import operation.
type ImportStatus string

const (
	ImportStatusPending       ImportStatus = "pending"        // created, not yet started
	ImportStatusRunning       ImportStatus = "running"        // importer goroutine is active
	ImportStatusPendingReview ImportStatus = "pending_review" // parsed; awaiting session selection
	ImportStatusComplete      ImportStatus = "complete"       // all selected sessions stored successfully
	ImportStatusFailed        ImportStatus = "failed"         // importer encountered a fatal error
)

// Import records a single SD-card import operation, including its source path,
// status lifecycle, and a count of how many sessions were discovered.
type Import struct {
	ID            string       `json:"id"`
	DeviceID      string       `json:"device_id"`               // set once the device is identified
	SourcePath    string       `json:"source_path"`             // absolute path to SD card or mirror
	SourceName    string       `json:"source_name"`             // human-readable label
	Status        ImportStatus `json:"status"`
	SessionCount  int          `json:"session_count"`           // sessions discovered during the import
	ErrorMessage  string       `json:"error_message,omitempty"` // non-empty when Status == Failed
	ParserVersion string       `json:"parser_version"`          // semver of the importer used
	StartedAt     time.Time    `json:"started_at"`
	CompletedAt   *time.Time   `json:"completed_at,omitempty"` // nil until the import finishes
	CreatedAt     time.Time    `json:"created_at"`
}
