#!/bin/bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$repo_dir"
exec "$repo_dir/.venv/bin/python" -m exhibition.autostart "$@"
