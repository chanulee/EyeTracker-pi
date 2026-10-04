#!/bin/bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"
export KERAS_BACKEND=torch
export PYTORCH_ENABLE_MPS_FALLBACK=1
python_bin="${EYE_PYTHON:-camera_accuracy/.venv/bin/python}"
if [ ! -x "$python_bin" ]; then
  if [ "$python_bin" != camera_accuracy/.venv/bin/python ]; then
    echo 'EYE_PYTHON 실행 경로를 확인하세요.' >&2
    exit 1
  fi
  echo '먼저 bash camera_accuracy/install-detectors.sh를 실행하세요.' >&2
  exit 1
fi
if ! "$python_bin" -c 'import aiohttp, cv2, numpy' 2>/dev/null; then
  "$python_bin" -m pip install -r camera_accuracy/requirements.txt
fi
exec "$python_bin" -m camera_accuracy.server "$@"
