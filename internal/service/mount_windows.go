// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

//go:build windows

package service

import (
	"fmt"
	"os"
)

// mountCandidates enumerates drive roots (C:\ through Z:\) and returns those
// that exist. The device detector filters out any that don't contain recognised
// CPAP data, so scanning all present drives is safe and avoids the need for
// Windows-specific API calls to distinguish removable media.
func mountCandidates() []string {
	var paths []string
	for c := 'C'; c <= 'Z'; c++ {
		root := fmt.Sprintf(`%c:\`, c)
		if _, err := os.Stat(root); err == nil {
			paths = append(paths, root)
		}
	}
	return paths
}
