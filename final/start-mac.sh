#!/bin/bash
set -euo pipefail
final_dir="$(cd "$(dirname "$0")" && pwd)"
python_bin="${EYE_PYTHON:-$final_dir/.venv/bin/python}"
if [ ! -x "$python_bin" ]; then
  echo '먼저 bash final/setup-mac.sh 를 실행하세요.' >&2
  exit 1
fi
exec "$python_bin" "$final_dir/run.py" "$@"
