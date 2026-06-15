#!/usr/bin/env bash
# Prepends a SPDX copyright header to every Go and TypeScript source file
# that doesn't already have one. Safe to re-run; idempotent.

set -euo pipefail

HEADER_GO="// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT
"

HEADER_TS="// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT
"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

add_header() {
  local file="$1"
  local header="$2"

  if head -1 "$file" | grep -q "Copyright"; then
    return
  fi

  local tmp
  tmp=$(mktemp)
  printf '%s\n' "$header" | cat - "$file" > "$tmp"
  mv "$tmp" "$file"
  echo "  + $file"
}

echo "→ Adding copyright headers to Go files…"
while IFS= read -r -d '' f; do
  add_header "$f" "$HEADER_GO"
done < <(find "$ROOT" \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -name "*.go" -print0)

echo "→ Adding copyright headers to TypeScript/TSX files…"
while IFS= read -r -d '' f; do
  add_header "$f" "$HEADER_TS"
done < <(find "$ROOT/web/src" \
  -not -path "*/node_modules/*" \
  \( -name "*.ts" -o -name "*.tsx" \) -print0)

echo "Done."
