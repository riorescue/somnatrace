# Privacy Policy

**SomnaTrace** — effective June 17, 2026

---

## The short version

SomnaTrace never transmits your data anywhere. Everything stays on your machine, under your control, always.

---

## What SomnaTrace processes

SomnaTrace reads and stores sleep therapy data that you explicitly import:

- **Session data** — nightly therapy metrics (AHI, usage hours, pressure readings, leak rates)
- **Signal waveforms** — pressure, flow, respiratory rate, and leak signals recorded by your device
- **Respiratory events** — apneas, hypopneas, RERAs, flow limitations, and other scored events
- **Device information** — make, model, firmware version, and hardware ID of your therapy device
- **Machine settings** — device configuration captured at import time
- **Clinical findings** — rule-based analysis results generated locally from your signal data

All of this data originates from your SD card and is stored in a local SQLite database on your machine.

---

## What SomnaTrace does NOT do

- **No network requests.** SomnaTrace makes zero outbound connections. No data is ever sent to any server, including the developers'.
- **No telemetry or analytics.** There is no usage tracking, error reporting, crash reporting, or behavioral analytics of any kind.
- **No accounts.** No login, no email, no user profile — SomnaTrace has no concept of identity.
- **No cloud storage.** Data is never synced, backed up remotely, or mirrored to any external service.
- **No third-party SDKs or trackers.** The frontend uses no analytics libraries, advertising networks, or third-party data collection tools.
- **No cookies or browser fingerprinting.** The embedded web interface sets no cookies and performs no fingerprinting.

---

## Where your data is stored

All data is stored in a single SQLite database file on your local machine:

| Platform | Default database path |
|---|---|
| macOS / Linux | `~/.somnatrace/somnatrace.db` |
| Windows | `C:\Users\<username>\.somnatrace\somnatrace.db` |

The database is never encrypted at rest by SomnaTrace — that responsibility belongs to your operating system's disk encryption (FileVault, BitLocker, LUKS, etc.), which we recommend enabling.

---

## Backup and restore

The built-in backup feature creates named snapshot copies of your database file. These snapshots are stored locally in the same application data directory. SomnaTrace does not upload backups anywhere. If you choose to copy a backup file to cloud storage (Dropbox, iCloud, Google Drive, etc.), that is your decision and subject to that service's privacy policy.

---

## Data you import

SomnaTrace reads your SD card data only when you initiate an import. The raw source files on your SD card are never modified. SomnaTrace reads them, parses the relevant data, and stores the result in the local database.

---

## Open source

SomnaTrace is open source. You can inspect exactly what the application does with your data by reading the source code at [https://github.com/riorescue/somnatrace](https://github.com/riorescue/somnatrace). There are no hidden behaviors.

---

## Medical disclaimer

SomnaTrace is not a medical device and is not intended to diagnose, treat, cure, or prevent any medical condition. The clinical analysis engine produces informational findings based on rule-based signal analysis. These findings are not a substitute for professional medical advice. Always consult your physician or sleep specialist regarding your therapy data and treatment decisions.

---

## Children's privacy

SomnaTrace does not knowingly collect any information from children or anyone else — all data resides on your own machine and is never transmitted.

---

## Changes to this policy

All changes to this policy are tracked in the [SomnaTrace GitHub repository](https://github.com/riorescue/somnatrace). The full revision history is publicly visible in the repository's commit log.

