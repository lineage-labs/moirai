#!/usr/bin/env bash
# Generate ed25519 PEM keys for the local AXL mesh (docker-compose.axl.yml).
# macOS: if `openssl genpkey -algorithm ed25519` fails, use Homebrew openssl@3:
#   OPENSSL=/opt/homebrew/opt/openssl@3/bin/openssl ./scripts/axl-keys.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_DIR="${ROOT_DIR}/docker/axl/keys"
OPENSSL="${OPENSSL:-openssl}"

mkdir -p "$KEY_DIR"

for name in alice bob charlie; do
  out="${KEY_DIR}/${name}.pem"
  if [[ -f "$out" ]]; then
    echo "exists: $out"
  else
    "$OPENSSL" genpkey -algorithm ed25519 -out "$out"
    chmod 600 "$out"
    echo "wrote: $out"
  fi
done

echo "Keys ready. Run: docker compose -f docker-compose.axl.yml build && docker compose -f docker-compose.axl.yml up -d"
