package models

// DbStats is the response payload for GET /api/v1/stats. It contains per-table
// row counts and the total on-disk size of the database (main file + WAL + SHM).
type DbStats struct {
	Counts    map[string]int `json:"counts"`     // table name → row count
	SizeBytes int64          `json:"size_bytes"` // total database size in bytes
}

// DetectedCard represents an SD card volume that was identified as a ResMed
// device export by the presence of Identification.json.
type DetectedCard struct {
	Path string `json:"path"` // absolute path to the mounted volume
}
