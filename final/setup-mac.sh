#!/bin/bash
set -euo pipefail
final_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$final_dir"
python3 -m venv .venv
.venv/bin/python -m pip install -r eye_tracking/requirements.txt
if [ ! -f .env ]; then cp .env.example .env; fi
cd frontend
npm ci --no-audit --no-fund
cd ..
.venv/bin/python run.py --build
echo '준비 완료: bash final/start-mac.sh'
