#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
# Also protects direct/manual script calls from overlapping with the timer.
exec 9>/run/lock/besc-social-sync.lock
flock -n 9 || { echo "Social synchronisatie loopt al; overgeslagen."; exit 0; }
docker compose exec -T web node - "$@" < ops/run-social-sync.cjs
