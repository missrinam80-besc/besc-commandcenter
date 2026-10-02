#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
sync_compose_file="${BESC_COMPOSE_FILE:-docker-compose.server.yml}"
if [[ ! -f "$sync_compose_file" ]]; then
  echo "Compose-bestand ontbreekt: $sync_compose_file. Stel BESC_COMPOSE_FILE in op het deploymentbestand." >&2
  exit 1
fi
# Also protects direct/manual script calls from overlapping with the timer.
exec 9>/run/lock/besc-social-sync.lock
flock -n 9 || { echo "Social synchronisatie loopt al; overgeslagen."; exit 0; }
docker compose -f "$sync_compose_file" exec -T web node - "$@" < ops/run-social-sync.cjs
