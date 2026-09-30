#!/bin/bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")" && pwd)"
exec bash "$repo_dir/exhibition/scripts/start-mac.sh" "$@"
