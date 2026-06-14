#!/usr/bin/env bash
# Start Go API and Vite dev server concurrently.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  echo ""
  echo "Stopping..."
  kill %1 %2 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "▸ Starting API on http://127.0.0.1:8080"
SOMNATRACE_MODE=development go run "${ROOT}/cmd/somnatrace" &

echo "▸ Starting UI on http://127.0.0.1:5173"
cd "${ROOT}/web" && npm run dev &

wait
