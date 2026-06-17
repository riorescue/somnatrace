// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

//go:build !darwin && !windows

package service

import "os"

// mountCandidates scans the common Linux/BSD removable-media mount points and
// returns any subdirectories found. Each is probed by the device detector and
// silently skipped if no recognised device signature is present.
func mountCandidates() []string {
	bases := []string{"/run/media", "/media", "/mnt"}
	var paths []string
	for _, base := range bases {
		entries, err := os.ReadDir(base)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			child := base + "/" + e.Name()
			// /run/media/<user>/<device> — descend one extra level
			if base == "/run/media" {
				subs, err := os.ReadDir(child)
				if err != nil {
					continue
				}
				for _, s := range subs {
					if s.IsDir() {
						paths = append(paths, child+"/"+s.Name())
					}
				}
			} else {
				paths = append(paths, child)
			}
		}
	}
	return paths
}
