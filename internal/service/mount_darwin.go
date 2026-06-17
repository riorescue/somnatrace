// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

//go:build darwin

package service

import "os"

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
