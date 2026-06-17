// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package dreamstation

import (
	"time"

	"github.com/riorescue/somnatrace/internal/models"
)

// ParsedEvents is the result of parsing one DreamStation events chunk (.002).
type ParsedEvents struct {
	Events    []models.Event
	Stats     []StatInterval // 2-minute pressure/leak/snore statistics
	IsBilevel bool
}

// StatInterval holds the 2-minute statistics report (event code 0x11).
type StatInterval struct {
	T          uint32  // seconds from chunk start
	TotalLeak  float64 // total leak L/min
	SnoreCount int
	Pressure   float64 // cmH2O (flex-adjusted EPAP for CPAP; time-weighted avg for BiLevel)
}

// ParseEventsF0V6 parses an events chunk for DreamStation devices (Family 0,
// FamilyVersion 6). chunkStart is the absolute Unix timestamp of the chunk.
// deviceID is embedded in each returned Event.
func ParseEventsF0V6(c *Chunk, chunkStart time.Time, deviceID string) ParsedEvents {
	var result ParsedEvents
	data := c.Data
	n := len(data)
	if n == 0 {
		return result
	}

	t := uint32(0) // cumulative seconds from chunk start
	pos := 0

	for pos < n {
		if pos >= n {
			break
		}
		code := data[pos]
		pos++

		size, ok := c.HBlock[code]
		if !ok {
			// Unknown code — can't determine size, stop parsing this chunk.
			break
		}
		sz := int(size)

		if pos+sz > n {
			break
		}

		payload := data[pos : pos+sz]

		// Most events start with a 2-byte little-endian time delta.
		if code != 0x12 {
			if sz < 2 {
				pos += sz
				continue
			}
			t += uint32(payload[0]) | uint32(payload[1])<<8
			payload = payload[2:]
		}

		switch code {
		case 0x01: // Pressure set (CPAP / Auto-CPAP)
			// no clinical event; just sets current pressure
		case 0x02: // Bi-level pressure set (IPAP, EPAP)
			result.IsBilevel = true

		case 0x05: // RERA
			if len(payload) >= 1 {
				elapsed := uint32(payload[0])
				result.Events = append(result.Events, makeEvent(deviceID, models.EventTypeRERA,
					chunkStart, t-elapsed, 0))
			}

		case 0x06: // Obstructive Apnea
			if len(payload) >= 1 {
				elapsed := uint32(payload[0])
				result.Events = append(result.Events, makeEvent(deviceID, models.EventTypeObstructiveApnea,
					chunkStart, t-elapsed, 0))
			}

		case 0x07: // Clear Airway (Central) Apnea
			if len(payload) >= 1 {
				elapsed := uint32(payload[0])
				result.Events = append(result.Events, makeEvent(deviceID, models.EventTypeCentralApnea,
					chunkStart, t-elapsed, 0))
			}

		case 0x0a, 0x14, 0x15: // Hypopnea (various sub-types)
			if len(payload) >= 1 {
				dur := uint32(payload[0])
				result.Events = append(result.Events, makeEvent(deviceID, models.EventTypeHypopnea,
					chunkStart, t-dur, 0))
			}

		case 0x0b: // Hypopnea (alternate encoding)
			if len(payload) >= 2 {
				elapsed := uint32(payload[1])
				result.Events = append(result.Events, makeEvent(deviceID, models.EventTypeHypopnea,
					chunkStart, t-elapsed, 0))
			}

		case 0x0c: // Flow Limitation
			if len(payload) >= 1 {
				elapsed := uint32(payload[0])
				result.Events = append(result.Events, makeEvent(deviceID, models.EventTypeFlowLimitation,
					chunkStart, t-elapsed, 0))
			}

		case 0x0f: // Periodic Breathing (duration-span event)
			if len(payload) >= 3 {
				dur := 2 * (uint32(payload[0]) | uint32(payload[1])<<8)
				elapsed := uint32(payload[2])
				result.Events = append(result.Events, makeEvent(deviceID, models.EventTypePeriodicBreathing,
					chunkStart, t-elapsed-dur, float64(dur)))
			}

		case 0x10: // Large Leak (duration-span event)
			if len(payload) >= 3 {
				dur := 2 * (uint32(payload[0]) | uint32(payload[1])<<8)
				elapsed := uint32(payload[2])
				result.Events = append(result.Events, makeEvent(deviceID, models.EventTypeLargeLeak,
					chunkStart, t-elapsed-dur, float64(dur)))
			}

		case 0x11: // 2-minute statistics block
			if len(payload) >= 3 {
				result.Stats = append(result.Stats, StatInterval{
					T:          t,
					TotalLeak:  float64(payload[0]),
					SnoreCount: int(payload[1]),
					Pressure:   float64(payload[2]) * 0.1,
				})
			}
		}

		pos += sz
	}

	return result
}

// makeEvent builds a models.Event from a raw chunk-relative timestamp.
func makeEvent(deviceID string, evType models.EventType, chunkStart time.Time, relSec uint32, durSec float64) models.Event {
	return models.Event{
		DeviceID:    deviceID,
		Type:        evType,
		StartTime:   chunkStart.Add(time.Duration(relSec) * time.Second).UTC(),
		DurationSec: durSec,
	}
}
