// seed creates realistic synthetic CPAP session data for development.
//
// Usage:
//
//	go run ./cmd/seed [--days N] [--db PATH]
//
// Each run generates a new random device serial number (consistent across all
// sessions in that run). Run once; run again if you want a second device worth
// of data. The target database must already exist with the schema applied
// (i.e. the server must have been started at least once).
package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	mrand "math/rand"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// ─── IDs ─────────────────────────────────────────────────────────────────────

func newID() string {
	b := make([]byte, 8)
	rand.Read(b) //nolint:errcheck
	return hex.EncodeToString(b)
}

// ─── Signal point ─────────────────────────────────────────────────────────────

type pt struct {
	T float64 `json:"t"`
	V float64 `json:"v"`
}

func r2(v float64) float64 { return math.Round(v*100) / 100 }

func marshalPts(pts []pt) string {
	b, _ := json.Marshal(pts)
	return string(b)
}

// ─── Signal generators ────────────────────────────────────────────────────────

// genPressure generates a cmH₂O pressure trace at 2-second intervals.
// Baseline is p50 with slow oscillation (sleep-cycle ~90 min) and noise.
func genPressure(rng *mrand.Rand, durSec int, p50, p95 float64) []pt {
	n := durSec / 2
	pts := make([]pt, n)
	// Slow oscillation tuned to roughly one sleep cycle crossing
	cycleRad := 2 * math.Pi / (float64(durSec) / 3.0)
	for i := range pts {
		t := float64(i * 2)
		drift := (p95 - p50) * 0.28 * math.Sin(t*cycleRad)
		noise := rng.NormFloat64() * 0.18
		v := p50 + drift + noise
		if v < 4.0 {
			v = 4.0
		}
		if v > p95+1.8 {
			v = p95 + 1.8
		}
		pts[i] = pt{t, r2(v)}
	}
	return pts
}

// genLeak generates a L/min mask leak trace at 2-second intervals.
// Mostly near the median with rare position-change spikes.
func genLeak(rng *mrand.Rand, durSec int, median float64) []pt {
	n := durSec / 2
	pts := make([]pt, n)
	for i := range pts {
		t := float64(i * 2)
		v := median + math.Abs(rng.NormFloat64())*0.45
		if rng.Float64() < 0.025 { // ~2.5% chance: mask shift spike
			v += rng.Float64()*10 + 3
		}
		if v < 0 {
			v = 0
		}
		pts[i] = pt{t, r2(v)}
	}
	return pts
}

// genRespRate generates a breaths/min trace at 2-second intervals.
// Slower during deeper sleep (roughly the first half of the night), rising
// toward morning — a simplified version of the real sleep-stage pattern.
func genRespRate(rng *mrand.Rand, durSec int) []pt {
	n := durSec / 2
	pts := make([]pt, n)
	base := 14.5 + rng.NormFloat64()*1.2
	for i := range pts {
		t := float64(i * 2)
		frac := t / float64(durSec)
		depth := -1.8 * math.Sin(frac*math.Pi) // trough at ~50% of the night
		noise := rng.NormFloat64() * 1.2
		v := base + depth + noise
		if v < 8 {
			v = 8
		}
		if v > 25 {
			v = 25
		}
		pts[i] = pt{t, r2(v)}
	}
	return pts
}

// genFlowLim generates a flow-limitation index (0–1) at 2-second intervals.
func genFlowLim(rng *mrand.Rand, durSec int) []pt {
	n := durSec / 2
	pts := make([]pt, n)
	for i := range pts {
		t := float64(i * 2)
		v := math.Abs(rng.NormFloat64()) * 0.055
		if v > 1 {
			v = 1
		}
		pts[i] = pt{t, r2(v)}
	}
	return pts
}

// genFlow generates a flow waveform (L/s) at 1-second intervals.
// Simulates cyclic inspiration / expiration at the given base respiratory rate.
func genFlow(rng *mrand.Rand, durSec int, respRateBase float64) []pt {
	pts := make([]pt, durSec)
	period := 60.0 / respRateBase  // seconds per breath
	amp := 0.38 + rng.Float64()*0.18 // 0.38–0.56 L/s peak
	for i := range pts {
		t := float64(i)
		phase := math.Mod(t, period) / period
		var v float64
		if phase < 0.42 {
			// Inspiration: positive half-sine
			v = amp * math.Sin(phase/0.42*math.Pi)
		} else {
			// Expiration: negative, slightly longer and shallower
			v = -amp * 0.72 * math.Sin((phase-0.42)/0.58*math.Pi)
		}
		v += rng.NormFloat64() * 0.015
		pts[i] = pt{t, r2(v)}
	}
	return pts
}

// ─── Session stats ────────────────────────────────────────────────────────────

type stats struct {
	durationMin float64
	ahi         float64
	p50, p95    float64
	pmax        float64
	leakMedian  float64
	aiIndex     float64 // apnea index component of AHI
	hiIndex     float64 // hypopnea index component of AHI
}

// genStats produces randomised but realistic session metrics.
// The baseline mirrors the real imported session: AHI ~2.5, pressure p50 ~5,
// AutoSet range 5–20 cmH₂O, well-fitting mask (near-zero leak).
func genStats(rng *mrand.Rand) stats {
	// Duration: centre ~7 hr, σ=60 min, clamped 5–9 hr
	dur := 420.0 + rng.NormFloat64()*60
	if dur < 300 {
		dur = 300
	}
	if dur > 540 {
		dur = 540
	}

	// AHI: lognormal around base ~2.2 (well-controlled therapy)
	ahi := math.Exp(math.Log(2.2) + rng.NormFloat64()*0.55)
	if ahi < 0.1 {
		ahi = 0.1
	}
	if ahi > 18 {
		ahi = 18
	}
	// ~8% chance of a poor night (nasal congestion, alcohol, positional)
	if rng.Float64() < 0.08 {
		ahi = 7 + rng.Float64()*12
	}

	// Pressure scales weakly with AHI (AutoSet titrates up when needed)
	p50 := 4.8 + ahi*0.14 + rng.NormFloat64()*0.28
	p95 := p50 + 1.1 + math.Abs(rng.NormFloat64())*0.5
	pmax := p95 + 0.8 + rng.Float64()*1.8
	if p50 < 4.0 {
		p50 = 4.0
	}
	if p95 < p50+0.4 {
		p95 = p50 + 0.4
	}
	if pmax < p95+0.2 {
		pmax = p95 + 0.2
	}
	if pmax > 20 {
		pmax = 20
	}

	// Leak: usually zero; ~15% of nights have mild mask leak
	leakMedian := 0.0
	if rng.Float64() < 0.15 {
		leakMedian = rng.Float64() * 4.5
	}

	// Split AHI into apnea index + hypopnea index (50–80% apnea fraction)
	apneaFrac := 0.5 + rng.Float64()*0.3
	aiIndex := ahi * apneaFrac
	hiIndex := ahi - aiIndex

	return stats{
		durationMin: math.Round(dur*10) / 10,
		ahi:         math.Round(ahi*10) / 10,
		p50:         math.Round(p50*100) / 100,
		p95:         math.Round(p95*100) / 100,
		pmax:        math.Round(pmax*100) / 100,
		leakMedian:  math.Round(leakMedian*100) / 100,
		aiIndex:     math.Round(aiIndex*10) / 10,
		hiIndex:     math.Round(hiIndex*10) / 10,
	}
}

// ─── Events ───────────────────────────────────────────────────────────────────

type event struct {
	id, sessionID, deviceID string
	typ                     string
	startTime               time.Time
	durationSec             float64
}

// Type weights: central apnea dominant (mirrors real data), with hypopneas
// common and obstructive/desaturation/large-leak rare.
var (
	eventTypes   = []string{"obstructive_apnea", "central_apnea", "hypopnea", "spo2_desaturation", "large_leak"}
	eventWeights = []float64{0.05, 0.55, 0.30, 0.07, 0.03}
)

func pickType(rng *mrand.Rand) string {
	r := rng.Float64()
	cum := 0.0
	for i, w := range eventWeights {
		cum += w
		if r < cum {
			return eventTypes[i]
		}
	}
	return "central_apnea"
}

func pickDuration(rng *mrand.Rand, typ string) float64 {
	switch typ {
	case "obstructive_apnea":
		return math.Round((10+rng.Float64()*25)*10) / 10
	case "central_apnea":
		return math.Round((10+rng.Float64()*14)*10) / 10 // real data: 10–16 s
	case "hypopnea":
		return math.Round((10+rng.Float64()*25)*10) / 10
	case "spo2_desaturation":
		return math.Round((20+rng.Float64()*40)*10) / 10
	case "large_leak":
		return math.Round((30+rng.Float64()*90)*10) / 10
	}
	return 0
}

// genEvents distributes events pseudo-randomly across the session.
// Events are mildly clustered in the first 60% of the night (more REM early).
func genEvents(rng *mrand.Rand, sessionID, deviceID string, sessionStart time.Time, durationMin, ahi float64) []event {
	count := int(math.Round(ahi * durationMin / 60.0))
	if count == 0 {
		return nil
	}
	durSec := durationMin * 60
	evts := make([]event, 0, count)
	for range count {
		frac := rng.Float64()
		if rng.Float64() < 0.6 {
			frac = rng.Float64() * 0.6 // cluster in first 60% of night
		}
		typ := pickType(rng)
		evts = append(evts, event{
			id:          newID(),
			sessionID:   sessionID,
			deviceID:    deviceID,
			typ:         typ,
			startTime:   sessionStart.Add(time.Duration(frac*durSec) * time.Second),
			durationSec: pickDuration(rng, typ),
		})
	}
	return evts
}

// ─── Device payload templates ─────────────────────────────────────────────────

// identPayload returns a device identification snapshot JSON blob with the
// provided serial number, mirroring the real AirSense 11 AutoSet structure.
func identPayload(rng *mrand.Rand, serial string) string {
	// Generate a random UUID v4
	uuid := fmt.Sprintf("%08x-%04x-4%03x-%04x-%012x",
		rng.Uint32(),
		rng.Uint32()&0xffff,
		rng.Uint32()&0xfff,
		(rng.Uint32()&0x3fff)|0x8000,
		rng.Int63n(0x1000000000000),
	)
	return fmt.Sprintf(
		`{"FlowGenerator":{"IdentificationProfiles":{"Product":{"UniversalIdentifier":%q,`+
			`"SerialNumber":%q,"SerialNumberVerificationCode":"","ProductCode":"39523",`+
			`"ProductName":"AirSense 11 AutoSet","FdaUniqueDeviceIdentifier":"",`+
			`"ProductGeographicIdentifier":"USA"},"Hardware":{"HardwareIdentifier":"`+
			`(90)R390-7703(91)AV004(21)2259N97108"},"Software":{"BootloaderIdentifier":`+
			`"SW04601.00.1.1.0.736edbdfd","ApplicationIdentifier":"SW04600.16.8.5.0.9cd562102",`+
			`"ConfigurationIdentifier":"CF04600.16.03.00.9cd562102","PlatformIdentifier":46,`+
			`"VariantIdentifier":3,"RegionIdentifier":0,"ProfileVariationIdentifier":`+
			`"00000000-0000-3000-8000-000016046003","DataVersionIdentifier":16,`+
			`"DataModelVersionIdentifier":"v2.15.3.53c1a73b8"}}}}`,
		uuid, serial,
	)
}

// settingsPayload is the therapy settings JSON blob from the real device.
// Settings don't meaningfully change night-to-night so we use one constant.
const settingsPayload = `{"FlowGenerator":{"SettingProfiles":{"Attributes":{"AppliedDateTime":"2026-06-11T05:04:48.628Z","Source":"","TransactionIdentifier":0},"ActiveProfiles":{"TherapyProfile":"AutoSetProfile","FeatureProfiles":["ComfortFeature","EprFeature","AutoRampFeature","SmartStartStopFeature","CircuitFeature","ClimateFeature","LanguageFeature","UserSolutionFeature","TemperatureFeature","PatientViewFeature","TimeZoneFeature","CareCheckFeature","DeviceHealthFeature","ReminderFeature","DisplayFeature","MaskSenseFeature"]},"TherapyProfiles":{"AutoSetProfile":{"TherapyMode":"AutoSet","MaxPressure":20.0,"MinPressure":5.0,"StartPressure":4.0},"AutoSetForHerProfile":{"TherapyMode":"HerAuto","MaxPressure":20.0,"MinPressure":4.0,"StartPressure":4.0},"CpapProfile":{"TherapyMode":"CPAP","SetPressure":10.0,"StartPressure":4.0}},"FeatureProfiles":{"ComfortFeature":{"AutoSetComfort":"Off"},"EprFeature":{"EprEnablePatientAccess":"On","EprEnable":"On","EprType":"FullTime","EprPressure":2},"AutoRampFeature":{"RampTime":20,"RampEnable":"Off"},"SmartStartStopFeature":{"SmartStart":"On","SmartStop":"Off"},"CircuitFeature":{"MaskType":"Pillows","TubeType":"15mmNonHeated","AntiBacterialFilter":"No"},"ClimateFeature":{"ClimateControl":"Auto","HumidifierSettingEnable":"On","HumidifierLevel":4,"HeatedTubeSettingEnable":"Auto","HeatedTubeTemperature":27.0},"LanguageFeature":{"LanguageConfiguration":163,"Language":"English","LanguageSelection":"Off"},"UserSolutionFeature":{"SurveyPersonalise":"No"},"TemperatureFeature":{"TemperatureUnit":"Fahrenheit"},"PatientViewFeature":{"PatientView":"Full","DisplayAHI":"Yes"},"TimeZoneFeature":{"TimeZoneOffset":"-08:00"},"CareCheckFeature":{"CareCheckToggle":"Off"},"DeviceHealthFeature":{"SoundcheckFeatureToggle":"On","SoundcheckRunFrequency":"Daily"},"ReminderFeature":{"ReminderMask":{"Enable":"Off","StartDateTime":"2000-01-01T00:00:00.000Z","Period":"P1M"},"ReminderTubing":{"Enable":"Off","StartDateTime":"2000-01-01T00:00:00.000Z","Period":"P1M"},"ReminderFilter":{"Enable":"Off","StartDateTime":"2000-01-01T00:00:00.000Z","Period":"P1M"},"ReminderHumidifier":{"Enable":"Off","StartDateTime":"2000-01-01T00:00:00.000Z","Period":"P1M"}},"DisplayFeature":{"TotalUsedHoursDisplayToggle":"Off","SplashScreenDisplaySelection":"ResMed","CycleDisplayFormat":"String","CareCheckInAvailable":"On","MyAirScreens":"On","ClinicalConfirmation":"Off","DynamicMessageToggle":"On"},"MaskSenseFeature":{"MaskSenseToggle":"On"}}}}}`

// ─── DB helpers ───────────────────────────────────────────────────────────────

func applyPragmas(db *sql.DB) error {
	for _, p := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
		"PRAGMA synchronous=NORMAL",
	} {
		if _, err := db.Exec(p); err != nil {
			return fmt.Errorf("pragma %q: %w", p, err)
		}
	}
	return nil
}

// ─── Paths ────────────────────────────────────────────────────────────────────

func defaultDBPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "./somnatrace.db"
	}
	return filepath.Join(home, ".somnatrace", "somnatrace.db")
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── main ─────────────────────────────────────────────────────────────────────

func main() {
	days := flag.Int("days", 30, "number of past days of sessions to generate")
	dbFlag := flag.String("db", "", "path to SQLite database (default: $SOMNATRACE_DB_PATH or ~/.somnatrace/somnatrace.db)")
	flag.Parse()

	dbPath := *dbFlag
	if dbPath == "" {
		dbPath = envOr("SOMNATRACE_DB_PATH", defaultDBPath())
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("open db %s: %v", dbPath, err)
	}
	defer db.Close()

	if err := applyPragmas(db); err != nil {
		log.Fatalf("pragmas: %v", err)
	}

	// Verify the schema exists before we write anything
	var dummy int
	if err := db.QueryRow("SELECT COUNT(*) FROM sessions").Scan(&dummy); err != nil {
		log.Fatalf("schema not found — start the server at least once to create tables: %v", err)
	}

	rng := mrand.New(mrand.NewSource(time.Now().UnixNano()))

	// One random serial number, consistent for all sessions in this run.
	// Format matches real ResMed device: 11-digit numeric string.
	serial := fmt.Sprintf("%011d", rng.Int63n(90000000000)+10000000000)
	deviceID := "dev-" + serial

	now := time.Now().UTC()
	pst := time.FixedZone("PST", -8*3600)

	// ── Device ───────────────────────────────────────────────────────────────

	firstSeen := now.AddDate(0, 0, -*days)
	_, err = db.Exec(`
		INSERT OR IGNORE INTO devices
			(id, family, manufacturer, model, serial_number, first_seen, last_seen, created_at)
		VALUES (?, 'resmed', 'ResMed', 'AirSense 11 AutoSet', ?, ?, ?, ?)`,
		deviceID, serial, firstSeen, now, now,
	)
	if err != nil {
		log.Fatalf("insert device: %v", err)
	}

	// ── Import record ─────────────────────────────────────────────────────────

	importID := newID()
	_, err = db.Exec(`
		INSERT INTO imports
			(id, device_id, source_path, source_name, status, session_count,
			 parser_version, started_at, completed_at, created_at)
		VALUES (?, ?, 'seed', 'seed-data', 'complete', 0, '0.1.0', ?, ?, ?)`,
		importID, deviceID, now, now, now,
	)
	if err != nil {
		log.Fatalf("insert import: %v", err)
	}

	fmt.Printf("Seeding %d days → device %s  serial %s\n\n", *days, deviceID, serial)

	// ── Sessions ──────────────────────────────────────────────────────────────

	tx, err := db.Begin()
	if err != nil {
		log.Fatalf("begin tx: %v", err)
	}

	inserted := 0
	skipped := 0

	for dayOffset := *days; dayOffset >= 1; dayOffset-- {
		// The local (PST) calendar date the person went to sleep
		sleepDate := now.In(pst).AddDate(0, 0, -dayOffset)
		localDate := sleepDate.Format("2006-01-02")

		// ~8% non-compliance (forgot mask, travel, etc.)
		if rng.Float64() < 0.08 {
			fmt.Printf("  [%s]  —  skipped\n", localDate)
			skipped++
			continue
		}

		// Bedtime: 9:00 PM – 11:30 PM local (150-min window)
		bedMin := 21*60 + rng.Intn(150) // minutes since midnight local
		sessionStart := time.Date(
			sleepDate.Year(), sleepDate.Month(), sleepDate.Day(),
			bedMin/60, bedMin%60, rng.Intn(60), 0, pst,
		).UTC()

		st := genStats(rng)
		durSec := int(st.durationMin * 60)
		sessionEnd := sessionStart.Add(time.Duration(durSec) * time.Second)
		sessionID := newID()

		// sessions
		_, err = tx.Exec(`
			INSERT INTO sessions
				(id, device_id, import_id, start_time, end_time, duration_minutes,
				 ahi, leak_rate_median, pressure_p50, pressure_p95, pressure_max, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			sessionID, deviceID, importID,
			sessionStart, sessionEnd,
			st.durationMin, st.ahi, st.leakMedian,
			st.p50, st.p95, st.pmax, now,
		)
		if err != nil {
			tx.Rollback()
			log.Fatalf("insert session [%s]: %v", localDate, err)
		}

		// session_signals — synthetic but visually plausible waveforms
		respRateBase := 14.5 + rng.NormFloat64()*1.2
		pressure := marshalPts(genPressure(rng, durSec, st.p50, st.p95))
		leak := marshalPts(genLeak(rng, durSec, st.leakMedian))
		respRate := marshalPts(genRespRate(rng, durSec))
		flowLim := marshalPts(genFlowLim(rng, durSec))
		flow := marshalPts(genFlow(rng, durSec, respRateBase))

		_, err = tx.Exec(`
			INSERT INTO session_signals
				(session_id, pressure, leak, resp_rate, flow_lim, flow, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			sessionID, pressure, leak, respRate, flowLim, flow, now,
		)
		if err != nil {
			tx.Rollback()
			log.Fatalf("insert signals [%s]: %v", localDate, err)
		}

		// events
		evts := genEvents(rng, sessionID, deviceID, sessionStart, st.durationMin, st.ahi)
		for _, e := range evts {
			_, err = tx.Exec(`
				INSERT OR IGNORE INTO events
					(id, session_id, device_id, type, start_time, duration_sec, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)`,
				e.id, e.sessionID, e.deviceID, e.typ, e.startTime, e.durationSec, now,
			)
			if err != nil {
				tx.Rollback()
				log.Fatalf("insert event [%s]: %v", localDate, err)
			}
		}

		// daily_summaries — one row per local date per device (UNIQUE constraint)
		leakP95 := math.Round(st.leakMedian*2.5*100) / 100
		_, err = tx.Exec(`
			INSERT OR IGNORE INTO daily_summaries
				(id, device_id, session_id, date, usage_minutes, ahi,
				 ai_index, hi_index, leak_rate_median, leak_rate_p95,
				 pressure_p50, pressure_p95, pressure_max, parser_version, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0.1.0', ?)`,
			newID(), deviceID, sessionID, localDate,
			st.durationMin, st.ahi, st.aiIndex, st.hiIndex,
			st.leakMedian, leakP95,
			st.p50, st.p95, st.pmax,
			now,
		)
		if err != nil {
			tx.Rollback()
			log.Fatalf("insert daily_summary [%s]: %v", localDate, err)
		}

		// settings_snapshot (one per session, unique index on session_id)
		_, err = tx.Exec(`
			INSERT OR IGNORE INTO settings_snapshots
				(id, device_id, session_id, captured_at, payload, created_at)
			VALUES (?, ?, ?, ?, ?, ?)`,
			newID(), deviceID, sessionID, sessionStart, settingsPayload, now,
		)
		if err != nil {
			tx.Rollback()
			log.Fatalf("insert settings_snapshot [%s]: %v", localDate, err)
		}

		// device_identification_snapshot (unique index on session_id)
		_, err = tx.Exec(`
			INSERT OR IGNORE INTO device_identification_snapshots
				(id, device_id, session_id, captured_at, payload, created_at)
			VALUES (?, ?, ?, ?, ?, ?)`,
			newID(), deviceID, sessionID, sessionStart, identPayload(rng, serial), now,
		)
		if err != nil {
			tx.Rollback()
			log.Fatalf("insert ident_snapshot [%s]: %v", localDate, err)
		}

		fmt.Printf("  [%s]  AHI=%-4.1f  dur=%.0fm  p50=%.1f p95=%.1f  leak=%.1f  events=%d\n",
			localDate, st.ahi, st.durationMin, st.p50, st.p95, st.leakMedian, len(evts))
		inserted++
	}

	if err := tx.Commit(); err != nil {
		log.Fatalf("commit: %v", err)
	}

	// Update the import's session count and device first/last seen from actuals
	db.Exec(`UPDATE imports SET session_count = ? WHERE id = ?`, inserted, importID)
	db.Exec(`
		UPDATE devices
		SET first_seen = (SELECT MIN(start_time) FROM sessions WHERE device_id = ?),
		    last_seen  = (SELECT MAX(start_time) FROM sessions WHERE device_id = ?)
		WHERE id = ?`,
		deviceID, deviceID, deviceID,
	)

	fmt.Printf("\n%d sessions inserted, %d nights skipped — device %s\n", inserted, skipped, deviceID)
}
