#!/bin/bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")" && pwd)"
export EYE_PYTHON="$repo_dir/.venv-pupil/bin/python"
export EYE_TRACKER=pupil
exec bash "$repo_dir/exhibition/scripts/start-mac.sh" "$@"
