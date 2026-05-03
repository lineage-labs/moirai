#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WITH_AXL_TESTS="${WITH_AXL_TESTS:-0}"
START_AXL_MESH="${START_AXL_MESH:-0}"
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
  if [[ "$START_AXL_MESH" == "1" ]]; then
    echo ">>> START_AXL_MESH=1: generating keys (if needed) and starting local 3-node AXL compose"
    run bash "$ROOT_DIR/scripts/axl-keys.sh"
    run docker compose -f "$ROOT_DIR/docker-compose.axl.yml" up -d --build
    export AXL_URL_1="${AXL_URL_1:-http://127.0.0.1:19002}"
    export AXL_URL_2="${AXL_URL_2:-http://127.0.0.1:19012}"
    export AXL_URL_3="${AXL_URL_3:-http://127.0.0.1:19022}"
    echo "    Using AXL_URL_1=$AXL_URL_1 AXL_URL_2=$AXL_URL_2 AXL_URL_3=$AXL_URL_3"
    echo

    echo ">>> waiting for the AXL mesh to fully peer (Yggdrasil + topology)"
    run env \
      AXL_URL_1="$AXL_URL_1" \
      AXL_URL_2="$AXL_URL_2" \
      AXL_URL_3="$AXL_URL_3" \
      bash "$ROOT_DIR/scripts/axl-mesh-check.sh"
  fi

  if [[ -z "${AXL_URL_1:-}" && -z "${AXL_URL:-}" ]]; then
    echo ">>> WITH_AXL_TESTS=1 but neither AXL_URL_1 nor AXL_URL is set. Skipping AXL integration tests."
    echo "    Tip: START_AXL_MESH=1 WITH_AXL_TESTS=1 to start docker-compose.axl.yml automatically."
    echo
  else
    echo ">>> running AXL integration tests"
    echo "    Prefer AXL_URL_1/2/3 (one per node). Falls back to AXL_URL for all if unset."
    echo
    run env \
      AXL_URL="${AXL_URL:-}" \
      AXL_URL_1="${AXL_URL_1:-${AXL_URL:-}}" \
      AXL_URL_2="${AXL_URL_2:-${AXL_URL:-}}" \
      AXL_URL_3="${AXL_URL_3:-${AXL_URL:-}}" \
      pnpm -C packages/kernel-impl exec vitest run src/adapters/axl.test.ts --reporter=verbose
  fi
fi

echo "Simulation flow complete."
