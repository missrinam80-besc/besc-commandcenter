#!/usr/bin/env bash
set +x
set -Eeuo pipefail
[[ $EUID == 0 && $(hostname -s) == BESCSRVDEV-02 && ${SSH_ORIGINAL_COMMAND:-} == probe && $# == 0 ]] || exit 1
exec /usr/bin/python3 /usr/local/lib/besc-operations/collect.py --config /etc/besc/operations-probe.json --emit-only
