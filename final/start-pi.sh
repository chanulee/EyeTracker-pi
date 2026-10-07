#!/bin/bash
set -euo pipefail
final_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$final_dir"
python_bin="${EYE_PYTHON:-$final_dir/.venv-pi/bin/python}"
case "${1:-}" in
  camera) shift; exec "$python_bin" -m eye_tracking.pi --config "$final_dir/state/pi-config.json" "$@" ;;
  sensors) shift; exec "$python_bin" sensors/server.py --reset-pin "${PI_IMU_RESET_PIN:-24}" "$@" ;;
  *) echo '사용법: bash final/start-pi.sh camera|sensors [옵션]' >&2; exit 1 ;;
esac
