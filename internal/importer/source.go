package importer

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// SourceType identifies the storage format of an import source.
type SourceType string

const (
	SourceTypeDirectory SourceType = "directory" // mounted SD card or mirror directory
	SourceTypeZip       SourceType = "zip"       // compressed archive (planned)
)

// Source describes an import source before any validation or parsing has occurred.
type Source struct {
	Path string
	Type SourceType
	Name string // human-readable label, typically the directory base name
}

// DetectSource stats path and returns a Source with the appropriate SourceType.
// It returns an error if path does not exist or is neither a directory nor a .zip file.
func DetectSource(path string) (Source, error) {
	info, err := os.Stat(path)
	if err != nil {
		return Source{}, err
	}

	s := Source{
		Path: path,
		Name: filepath.Base(path),
	}

	if info.IsDir() {
		s.Type = SourceTypeDirectory
		return s, nil
	}

	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".zip" {
		s.Type = SourceTypeZip
		return s, nil
	}

	return Source{}, errors.New("importer: unsupported source type (expected directory or .zip)")
}
