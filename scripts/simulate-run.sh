#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WITH_AXL_TESTS="${WITH_AXL_TESTS:-0}"
SKIP_TYPECHECK="${SKIP_TYPECHECK:-0}"
SKIP_TESTS="${SKIP_TESTS:-0}"
SKIP_SPIKE="${SKIP_SPIKE:-0}"

echo "== moirai simulate run =="
echo "root: $ROOT_DIR"
echo

run() {
  echo ">>> $*"
  "$@"
  echo
}

if [[ "$SKIP_TYPECHECK" != "1" ]]; then
  run pnpm typecheck
else
  echo ">>> skipping typecheck (SKIP_TYPECHECK=1)"
  echo
fi

if [[ "$SKIP_TESTS" != "1" ]]; then
  run pnpm -C packages/kernel-impl test
else
  echo ">>> skipping tests (SKIP_TESTS=1)"
  echo
fi

if [[ "$SKIP_SPIKE" != "1" ]]; then
  if [[ -f "$ROOT_DIR/.env" ]]; then
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
  fi

  if [[ -n "${ZG_RPC_URL:-}" && -n "${ZG_PRIVATE_KEY:-}" && -n "${ZG_INDEXER_URL:-}" ]]; then
    run pnpm -C packages/kernel-impl spike
  else
    echo ">>> skipping spike (missing one or more required env vars)"
    echo "    Required: ZG_RPC_URL, ZG_PRIVATE_KEY, ZG_INDEXER_URL"
    echo "    Create .env from .env.example, then rerun."
    echo
  fi
else
  echo ">>> skipping spike (SKIP_SPIKE=1)"
  echo
fi

if [[ "$WITH_AXL_TESTS" == "1" ]]; then
  if [[ -z "${AXL_URL:-}" ]]; then
    echo ">>> WITH_AXL_TESTS=1 but AXL_URL is not set. Skipping AXL integration tests."
    echo
  else
    echo ">>> running AXL integration tests"
    echo "    Note: these require a compatible AXL setup and may fail in single-node configs."
    echo
    run env AXL_URL="$AXL_URL" pnpm -C packages/kernel-impl exec vitest run src/adapters/axl.test.ts --reporter=verbose
  fi
fi

echo "Simulation flow complete."
