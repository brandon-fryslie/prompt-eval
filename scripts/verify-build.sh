#!/usr/bin/env bash
# verify-build.sh — Verify that a local build matches published build hashes.
#
# Usage:
#   ./scripts/verify-build.sh [path/to/BUILD_HASHES.sha256]
#
# This script:
#   1. Runs `npm ci` and `npm run build` to produce a clean local build.
#   2. Generates SHA-256 hashes of every file in dist/.
#   3. If a BUILD_HASHES.sha256 file is provided (or exists in the repo root),
#      compares the local hashes against it and reports mismatches.
#   4. Otherwise, prints the hashes so you can compare manually.
#
# Prerequisites:
#   - Node.js and npm
#   - sha256sum (Linux) or shasum (macOS)
#
# The script must be run from the repository root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Detect the sha256 hashing command available on this platform.
# macOS ships with `shasum`; Linux typically has `sha256sum`.
if command -v sha256sum >/dev/null 2>&1; then
  hash_cmd=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  hash_cmd=(shasum -a 256)
else
  echo "ERROR: Neither sha256sum nor shasum found. Install coreutils." >&2
  exit 1
fi

echo "==> Installing dependencies (npm ci)..."
npm ci --silent

echo "==> Building (npm run build)..."
npm run build --silent

echo "==> Generating hashes of dist/ files..."
LOCAL_HASHES=$(find dist -type f -not -name 'BUILD_HASHES.sha256' -print0 | sort -z | xargs -0 "${hash_cmd[@]}")

# Determine whether a reference hash file was provided or exists locally.
REFERENCE_FILE="${1:-}"
if [ -z "$REFERENCE_FILE" ] && [ -f "BUILD_HASHES.sha256" ]; then
  REFERENCE_FILE="BUILD_HASHES.sha256"
fi

if [ -n "$REFERENCE_FILE" ]; then
  if [ ! -f "$REFERENCE_FILE" ]; then
    echo "ERROR: Reference file not found: $REFERENCE_FILE" >&2
    exit 1
  fi

  echo "==> Comparing against: $REFERENCE_FILE"

  # Normalize both sets: strip leading ./ and sort by filename (second column).
  LOCAL_NORMALIZED=$(echo "$LOCAL_HASHES" | sed 's|  \./|  |' | sort -k2)
  REF_NORMALIZED=$(sed 's|  \./|  |' "$REFERENCE_FILE" | sort -k2)

  if diff <(echo "$REF_NORMALIZED") <(echo "$LOCAL_NORMALIZED") >/dev/null 2>&1; then
    echo ""
    echo "BUILD VERIFIED: Local hashes match the reference file."
    exit 0
  else
    echo ""
    echo "BUILD MISMATCH: Differences found."
    echo ""
    diff --unified <(echo "$REF_NORMALIZED") <(echo "$LOCAL_NORMALIZED") || true
    exit 1
  fi
else
  echo ""
  echo "No reference hash file provided. Printing local hashes:"
  echo "---"
  echo "$LOCAL_HASHES"
  echo "---"
  echo ""
  echo "To verify, compare these against BUILD_HASHES.sha256 from the GitHub release artifact."
  exit 0
fi
