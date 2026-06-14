#!/usr/bin/env bash
# Build the Vite frontend and place assets in internal/web/dist/.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▸ Installing frontend dependencies…"
cd "${ROOT}/web"
npm ci

echo "▸ Building frontend…"
npm run build

echo "✓ Frontend built → internal/web/dist/"
