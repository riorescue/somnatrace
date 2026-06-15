// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

// Package web embeds the compiled React frontend into the binary and provides
// helpers for serving it. In production the Go server serves both the API and
// the static UI from a single executable. In development, Vite runs separately
// on port 5173 and this package is not used for UI serving.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// DistFS returns a sub-filesystem rooted at the embedded dist/ directory,
// suitable for passing to http.FileServer or fs.Stat.
func DistFS() (fs.FS, error) {
	return fs.Sub(distFS, "dist")
}
