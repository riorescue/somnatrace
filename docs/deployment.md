# Production Deployment

SomnaTrace ships as a **single self-contained binary** — the React frontend is embedded at compile time, and the SQLite database is managed automatically. No web server, runtime, or external database is required.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Building from Source](#building-from-source)
- [Configuration](#configuration)
- [Running in Production](#running-in-production)
  - [macOS](#macos)
  - [Linux](#linux)
  - [Windows](#windows)
- [Running as a System Service](#running-as-a-system-service)
  - [macOS — launchd](#macos--launchd)
  - [Linux — systemd](#linux--systemd)
  - [Windows — Service Wrapper](#windows--service-wrapper)
- [Docker](#docker)
- [Releasing Binaries](#releasing-binaries)
  - [Manual Cross-Compilation](#manual-cross-compilation)
  - [Automated Releases with GoReleaser](#automated-releases-with-goreleaser)
- [Data Management](#data-management)

---

## Prerequisites

Building SomnaTrace requires:

| Tool | Minimum Version | Notes |
|---|---|---|
| Go | 1.25 | [go.dev/dl](https://go.dev/dl) |
| Node.js | 20 | [nodejs.org](https://nodejs.org) |
| npm | 10 | Bundled with Node |
| git | any | Required for version embedding |

Pre-built binaries (see [Releasing Binaries](#releasing-binaries)) require **nothing** — just the binary itself.

---

## Building from Source

The build is a two-step process: compile the frontend, then embed it into the Go binary.

```bash
# 1. Clone the repository
git clone https://github.com/riorescue/somnatrace.git
cd somnatrace

# 2. Install frontend dependencies
cd web && npm ci && cd ..

# 3. Build — frontend first, then Go binary
make build
```

`make build` runs `make build-ui` (outputs to `internal/web/dist/`) followed by `make build-go` (embeds `dist/` and produces the `./somnatrace` binary).

To build steps individually:

```bash
make build-ui    # frontend only — outputs internal/web/dist/
make build-go    # Go binary only — requires build-ui to have run first
```

The resulting binary embeds the full frontend and requires no external files to run.

---

## Configuration

All configuration is read from environment variables. Every variable has a sensible default so the server runs with no environment configuration at all.

| Variable | Default | Description |
|---|---|---|
| `SOMNATRACE_HOST` | `127.0.0.1` | Bind address |
| `SOMNATRACE_PORT` | `8080` | Listen port |
| `SOMNATRACE_MODE` | `production` | Set to `development` for local development |
| `SOMNATRACE_DATA_DIR` | `~/.somnatrace` | Directory for the database and backups |
| `SOMNATRACE_DB_PATH` | `$DATA_DIR/somnatrace.db` | Full path to the SQLite file |

In development mode the binary does not serve the embedded frontend — leave `SOMNATRACE_MODE` unset (or set it to `production`) for deployed instances.

To listen on all interfaces (e.g., for Docker or a reverse proxy):

```bash
SOMNATRACE_HOST=0.0.0.0
```

---

## Running in Production

### macOS

```bash
# Copy the binary somewhere on your PATH
sudo cp somnatrace /usr/local/bin/somnatrace
sudo chmod +x /usr/local/bin/somnatrace

# Run
SOMNATRACE_MODE=production somnatrace
```

The app is available at [http://127.0.0.1:8080](http://127.0.0.1:8080).

The database is created automatically at `~/.somnatrace/somnatrace.db` on first launch.

macOS may quarantine a downloaded binary. Remove the quarantine attribute before running:

```bash
xattr -d com.apple.quarantine somnatrace
```

### Linux

```bash
sudo cp somnatrace /usr/local/bin/somnatrace
sudo chmod +x /usr/local/bin/somnatrace

SOMNATRACE_MODE=production somnatrace
```

The database lands at `~/.somnatrace/somnatrace.db`. To use a different location (common on servers):

```bash
SOMNATRACE_MODE=production \
SOMNATRACE_DATA_DIR=/var/lib/somnatrace \
somnatrace
```

### Windows

Rename the binary to `somnatrace.exe` and run it from PowerShell or Command Prompt:

```powershell
$env:SOMNATRACE_MODE="production"
.\somnatrace.exe
```

The database is created at `%USERPROFILE%\.somnatrace\somnatrace.db` (`C:\Users\<you>\.somnatrace\`).

To use a different data directory:

```powershell
$env:SOMNATRACE_MODE="production"
$env:SOMNATRACE_DATA_DIR="C:\SomnaTrace\data"
.\somnatrace.exe
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080) in a browser.

---

## Running as a System Service

### macOS — launchd

Create a plist at `~/Library/LaunchAgents/com.somnatrace.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.somnatrace</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/somnatrace</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>SOMNATRACE_MODE</key>
        <string>production</string>
        <key>SOMNATRACE_HOST</key>
        <string>127.0.0.1</string>
        <key>SOMNATRACE_PORT</key>
        <string>8080</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/tmp/somnatrace.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/somnatrace.log</string>
</dict>
</plist>
```

Load and start the service:

```bash
launchctl load ~/Library/LaunchAgents/com.somnatrace.plist
launchctl start com.somnatrace
```

To stop or unload:

```bash
launchctl stop com.somnatrace
launchctl unload ~/Library/LaunchAgents/com.somnatrace.plist
```

### Linux — systemd

Create `/etc/systemd/system/somnatrace.service`:

```ini
[Unit]
Description=SomnaTrace sleep data server
After=network.target

[Service]
Type=simple
User=somnatrace
Group=somnatrace
ExecStart=/usr/local/bin/somnatrace
Restart=on-failure
RestartSec=5

Environment=SOMNATRACE_MODE=production
Environment=SOMNATRACE_HOST=127.0.0.1
Environment=SOMNATRACE_PORT=8080
Environment=SOMNATRACE_DATA_DIR=/var/lib/somnatrace

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/var/lib/somnatrace

[Install]
WantedBy=multi-user.target
```

Set up the service user and data directory, then enable:

```bash
# Create a dedicated user (no login shell, no home dir)
sudo useradd --system --no-create-home --shell /usr/sbin/nologin somnatrace

# Create and own the data directory
sudo mkdir -p /var/lib/somnatrace
sudo chown somnatrace:somnatrace /var/lib/somnatrace

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable somnatrace
sudo systemctl start somnatrace

# Check status
sudo systemctl status somnatrace
sudo journalctl -u somnatrace -f
```

### Windows — Service Wrapper

Windows does not natively run arbitrary executables as services. Use [NSSM (Non-Sucking Service Manager)](https://nssm.cc) to wrap the binary.

```powershell
# Install NSSM (via Winget or download from nssm.cc)
winget install nssm

# Install somnatrace as a service
nssm install SomnaTrace "C:\Program Files\SomnaTrace\somnatrace.exe"
nssm set SomnaTrace AppEnvironmentExtra "SOMNATRACE_MODE=production"
nssm set SomnaTrace AppEnvironmentExtra+ "SOMNATRACE_DATA_DIR=C:\ProgramData\SomnaTrace"
nssm set SomnaTrace Start SERVICE_AUTO_START
nssm set SomnaTrace AppStdout "C:\ProgramData\SomnaTrace\logs\somnatrace.log"
nssm set SomnaTrace AppStderr "C:\ProgramData\SomnaTrace\logs\somnatrace.log"

# Start the service
nssm start SomnaTrace
```

Manage it like any Windows service:

```powershell
nssm stop SomnaTrace
nssm restart SomnaTrace
nssm remove SomnaTrace confirm
```

---

## Docker

A multi-stage `Dockerfile` and `docker-compose.yml` are included in the repository.

**Quick start with Docker Compose:**

```bash
docker compose up -d
```

This builds the image, starts the container on port 8080, and persists data in a named Docker volume (`somnatrace-data`).

**Manual Docker run:**

```bash
# Build
docker build -t somnatrace:latest .

# Run
docker run -d \
  --name somnatrace \
  -p 8080:8080 \
  -v somnatrace-data:/data \
  -e SOMNATRACE_MODE=production \
  -e SOMNATRACE_DATA_DIR=/data \
  --restart unless-stopped \
  somnatrace:latest
```

The container binds to `0.0.0.0:8080` inside (mapped to host port 8080). Data is persisted in the `/data` volume.

---

## Releasing Binaries

SomnaTrace cross-compiles cleanly because it uses `modernc.org/sqlite`, a pure-Go SQLite implementation that requires no CGO. A single build machine can produce binaries for all three platforms.

### Manual Cross-Compilation

Build the frontend once, then cross-compile for each target:

```bash
# Step 1 — build the frontend (only needed once per release)
make build-ui

# Step 2 — set the version from the current git tag
VERSION=$(git describe --tags --always --dirty)

# macOS (Apple Silicon)
GOOS=darwin  GOARCH=arm64 go build \
  -ldflags "-s -w -X github.com/riorescue/somnatrace/internal/config.Version=$VERSION" \
  -o dist/somnatrace-darwin-arm64 ./cmd/somnatrace

# macOS (Intel)
GOOS=darwin  GOARCH=amd64 go build \
  -ldflags "-s -w -X github.com/riorescue/somnatrace/internal/config.Version=$VERSION" \
  -o dist/somnatrace-darwin-amd64 ./cmd/somnatrace

# Linux (x86-64)
GOOS=linux   GOARCH=amd64 go build \
  -ldflags "-s -w -X github.com/riorescue/somnatrace/internal/config.Version=$VERSION" \
  -o dist/somnatrace-linux-amd64 ./cmd/somnatrace

# Linux (ARM64 — Raspberry Pi, AWS Graviton)
GOOS=linux   GOARCH=arm64 go build \
  -ldflags "-s -w -X github.com/riorescue/somnatrace/internal/config.Version=$VERSION" \
  -o dist/somnatrace-linux-arm64 ./cmd/somnatrace

# Windows (x86-64)
GOOS=windows GOARCH=amd64 go build \
  -ldflags "-s -w -X github.com/riorescue/somnatrace/internal/config.Version=$VERSION" \
  -o dist/somnatrace-windows-amd64.exe ./cmd/somnatrace
```

The `-s -w` flags strip debug symbols and DWARF info, meaningfully reducing binary size.

Archive each binary for distribution:

```bash
# macOS / Linux — tar.gz
tar -czf dist/somnatrace-darwin-arm64.tar.gz  -C dist somnatrace-darwin-arm64
tar -czf dist/somnatrace-linux-amd64.tar.gz   -C dist somnatrace-linux-amd64

# Windows — zip
zip -j dist/somnatrace-windows-amd64.zip dist/somnatrace-windows-amd64.exe
```

### Automated Releases with GoReleaser

[GoReleaser](https://goreleaser.com) automates building, archiving, and publishing release artifacts. Install it once:

```bash
# macOS
brew install goreleaser

# Linux
go install github.com/goreleaser/goreleaser/v2@latest
```

Create `.goreleaser.yaml` in the repository root:

```yaml
version: 2

before:
  hooks:
    # Build the frontend before any Go compilation
    - make build-ui

builds:
  - id: somnatrace
    main: ./cmd/somnatrace
    binary: somnatrace
    ldflags:
      - -s -w
      - -X github.com/riorescue/somnatrace/internal/config.Version={{.Version}}
    goos:
      - linux
      - darwin
      - windows
    goarch:
      - amd64
      - arm64
    ignore:
      - goos: windows
        goarch: arm64   # Windows ARM64 has limited user base; add back when needed

archives:
  - id: default
    name_template: "somnatrace-{{ .Version }}-{{ .Os }}-{{ .Arch }}"
    format_overrides:
      - goos: windows
        formats: [zip]
    files:
      - README.md
      - LICENSE

checksum:
  name_template: "somnatrace-{{ .Version }}-checksums.txt"

snapshot:
  version_template: "{{ .Tag }}-next"

changelog:
  sort: asc
  filters:
    exclude:
      - "^docs:"
      - "^test:"
      - "^chore:"
```

**Test a snapshot build locally** (no git tag needed):

```bash
goreleaser release --snapshot --clean
```

Artifacts land in `dist/`.

**Cut a real release:**

```bash
git tag v0.1.0
git push origin v0.1.0

# Publish to GitHub Releases (requires GITHUB_TOKEN)
goreleaser release --clean
```

GoReleaser creates a GitHub Release automatically, uploads all archives, and generates a checksum file.

---

## Data Management

**Database location:**

| Platform | Default path |
|---|---|
| macOS / Linux | `~/.somnatrace/somnatrace.db` |
| Windows | `%USERPROFILE%\.somnatrace\somnatrace.db` |
| Docker | `/data/somnatrace.db` (in named volume) |

Override with `SOMNATRACE_DATA_DIR` or `SOMNATRACE_DB_PATH`.

**Backups** are written to `$DATA_DIR/backups/` by the in-app Utilities page. Each backup is a clean single-file snapshot (no WAL sidecar). For automated offsite backups, copy or sync the `backups/` directory on a schedule.

**WAL files** (`somnatrace.db-wal`, `somnatrace.db-shm`) are normal during operation. They are merged into the main file automatically by SQLite on a clean shutdown. The Utilities → Vacuum function forces a merge and reclaims space without restarting the server.

**Migrations** run automatically on every startup. The server is safe to upgrade in place — just replace the binary and restart.
