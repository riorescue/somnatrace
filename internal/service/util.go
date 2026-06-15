// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package service

import (
	"crypto/rand"
	"encoding/hex"
)

// newID generates a random 8-byte (16 hex character) identifier suitable for
// use as a primary key in any table.
func newID() string {
	b := make([]byte, 8)
	rand.Read(b) //nolint:errcheck — crypto/rand.Read never returns an error on supported platforms
	return hex.EncodeToString(b)
}
