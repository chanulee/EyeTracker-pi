#!/bin/bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_dir"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import aiohttp, cv2, numpy' 2>/dev/null; then
  .venv/bin/python -m pip install -r exhibition/requirements.txt
fi
if [ "${1:-}" = --two-users ]; then
  shift
  if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != --simulate ]; }; then
    echo '사용법: bash exhibition/scripts/start-mac.sh --two-users [--simulate]' >&2
    exit 1
  fi
  .venv/bin/python -m exhibition.mac --user-id 1 --port 8080 --config exhibition/mac-config.json "$@" &
  user1_pid=$!
  .venv/bin/python -m exhibition.mac --user-id 2 --port 8081 --config exhibition/mac-user2-config.json "$@" &
  user2_pid=$!
  trap 'kill "$user1_pid" "$user2_pid" 2>/dev/null || true' EXIT INT TERM
  wait "$user1_pid" "$user2_pid"
else
  exec .venv/bin/python -m exhibition.mac "$@"
fi
