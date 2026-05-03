#!/usr/bin/env bash
# Verify the local AXL mesh (docker-compose.axl.yml) is healthy before integration tests.
#
# Checks each AXL node's /topology and asserts:
#   - the API is reachable
#   - the daemon has its own pubkey
#   - peers[] contains the *other* nodes' pubkeys (Yggdrasil mesh is established)
#
# Usage:
#   bash ./scripts/axl-mesh-check.sh                 # default 60s wait
#   AXL_MESH_WAIT_SECS=120 bash ./scripts/axl-mesh-check.sh

set -euo pipefail

URL_ALICE="${AXL_URL_1:-http://127.0.0.1:19002}"
URL_BOB="${AXL_URL_2:-http://127.0.0.1:19012}"
URL_CHARLIE="${AXL_URL_3:-http://127.0.0.1:19022}"
WAIT_SECS="${AXL_MESH_WAIT_SECS:-60}"

need_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "axl-mesh-check requires 'jq'. Install: brew install jq" >&2
    exit 2
  fi
}
need_jq

fetch_pubkey() {
  curl -sf --max-time 2 "$1/topology" | jq -r '.our_public_key // empty'
}

fetch_peers() {
  curl -sf --max-time 2 "$1/topology" | jq -r '[.peers[]? | .key // .public_key // .pubkey // empty] | join(" ")'
}

deadline=$(( $(date +%s) + WAIT_SECS ))
echo "Waiting up to ${WAIT_SECS}s for AXL mesh on:"
echo "  alice   -> $URL_ALICE"
echo "  bob     -> $URL_BOB"
echo "  charlie -> $URL_CHARLIE"

while :; do
  alice_pk="$(fetch_pubkey "$URL_ALICE" || true)"
  bob_pk="$(fetch_pubkey "$URL_BOB" || true)"
  charlie_pk="$(fetch_pubkey "$URL_CHARLIE" || true)"

  if [[ -n "$alice_pk" && -n "$bob_pk" && -n "$charlie_pk" ]]; then
    alice_peers="$(fetch_peers "$URL_ALICE" || true)"
    bob_peers="$(fetch_peers "$URL_BOB" || true)"
    charlie_peers="$(fetch_peers "$URL_CHARLIE" || true)"

    # Sanity 1: alice's own pubkey must match what bob/charlie see for peer "tls://alice:9001".
    # Mismatch means $URL_ALICE is hitting a *different* daemon than the docker container
    # (classic macOS port-collision: a standalone AXL on 127.0.0.1:9002 wins over docker's
    # 0.0.0.0:9002 publish). All sub_ad traffic would silently route to the wrong daemon.
    bob_alice_pk="$(curl -sf --max-time 2 "$URL_BOB/topology" \
      | jq -r '[.peers[]? | select(.uri | contains("alice")) | .public_key // .key // .pubkey // empty][0] // empty' || true)"

    if [[ -n "$bob_alice_pk" && "$bob_alice_pk" != "$alice_pk" ]]; then
      echo "ERROR: $URL_ALICE returns pubkey $alice_pk but bob's mesh sees alice as $bob_alice_pk." >&2
      echo "       This means $URL_ALICE is NOT the docker mesh's alice container." >&2
      echo "" >&2
      echo "Most likely: a standalone AXL daemon is bound to 127.0.0.1:9002 and shadowing the" >&2
      echo "docker publish. Find and stop it, or move the docker mesh to non-conflicting ports." >&2
      echo "" >&2
      echo "  lsof -nP -iTCP:9002 -sTCP:LISTEN     # find the squatter" >&2
      echo "  kill <pid>                            # if it's a stray AXL daemon" >&2
      echo "" >&2
      echo "Or, simplest: docker-compose.axl.yml already uses 19002/19012/19022. Make sure your" >&2
      echo ".env has AXL_URL_1=http://127.0.0.1:19002 (bob 19012, charlie 19022)." >&2
      exit 1
    fi

    # Hub-and-spoke: alice peers with bob+charlie; bob/charlie each peer with alice.
    if [[ " $alice_peers " == *" $bob_pk "* ]] \
      && [[ " $alice_peers " == *" $charlie_pk "* ]] \
      && [[ " $bob_peers " == *" $alice_pk "* ]] \
      && [[ " $charlie_peers " == *" $alice_pk "* ]]; then
      echo "OK: AXL mesh is fully peered."
      echo "  alice   ($alice_pk) <-> bob, charlie"
      echo "  bob     ($bob_pk) <-> alice"
      echo "  charlie ($charlie_pk) <-> alice"
      exit 0
    fi
  fi

  if (( $(date +%s) >= deadline )); then
    echo "ERROR: AXL mesh never became ready within ${WAIT_SECS}s." >&2
    echo "  alice pubkey:   ${alice_pk:-<unreachable>}" >&2
    echo "  bob pubkey:     ${bob_pk:-<unreachable>}" >&2
    echo "  charlie pubkey: ${charlie_pk:-<unreachable>}" >&2
    echo "  alice peers:    ${alice_peers:-<n/a>}" >&2
    echo "  bob peers:      ${bob_peers:-<n/a>}" >&2
    echo "  charlie peers:  ${charlie_peers:-<n/a>}" >&2
    echo "" >&2
    echo "Likely causes:" >&2
    echo "  1. Containers not running. Run: pnpm axl:mesh:up" >&2
    echo "  2. Yggdrasil peering blocked. Inspect: docker logs moirai-axl-bob" >&2
    echo "  3. Stale containers using old keys. Run: pnpm axl:mesh:down && pnpm axl:mesh:up" >&2
    echo "  4. URL hits a non-mesh daemon. Run: bash scripts/axl-mesh-check.sh again to see if" >&2
    echo "     the pubkey-mismatch error fires." >&2
    exit 1
  fi

  sleep 1
done
