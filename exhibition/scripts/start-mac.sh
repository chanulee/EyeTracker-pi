#!/bin/bash
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_dir"
python_bin="${EYE_PYTHON:-.venv/bin/python}"
state_dir="${EYE_STATE_DIR:-exhibition}"
# Explicit single-user mode is retained for development.
if [ "${1:-}" = --single-user ]; then
  shift
  single_user=1
else
  single_user=0
fi
if [ ! -x "$python_bin" ] && [ "$python_bin" != .venv/bin/python ]; then
  echo 'Pupil 환경을 설치하세요: bash exhibition/scripts/install-pupil-mac.sh' >&2
  exit 1
fi
if [ ! -x "$python_bin" ]; then
  python3 -m venv .venv
fi
if ! "$python_bin" -c 'import aiohttp, cv2, numpy' 2>/dev/null; then
  "$python_bin" -m pip install -r exhibition/requirements.txt
fi
if [ "$single_user" -eq 1 ]; then
  exec "$python_bin" -m exhibition.mac "$@"
fi
simulate=0
export EYE_OPEN_ADMIN=1
while [ "$#" -gt 0 ]; do
  case "$1" in
    --two-users) shift ;;
    --simulate) simulate=1; shift ;;
    --no-open) export EYE_OPEN_ADMIN=0; shift ;;
    --frontend-url)
      if [ "$#" -lt 2 ]; then echo '--frontend-url 뒤에 작품 주소를 입력하세요.' >&2; exit 1; fi
      export EYE_FRONTEND_URL="$2"; shift 2 ;;
    *) echo '사용법: bash start-mac.sh [--two-users] [--simulate] [--frontend-url URL] [--no-open]' >&2; exit 1 ;;
  esac
done
# Bash 3.2 treats an empty array as unset under set -u. Positional arguments
# expand safely when empty and also preserve each worker option as one word.
set --
if [ "$simulate" -eq 1 ]; then set -- --simulate; fi
"$python_bin" -c 'from exhibition.startup import prepare; prepare()'
"$python_bin" -m exhibition.mac --worker --user-id 1 --port 8080 --config "$state_dir/mac-config.json" "$@" &
user1_pid=$!
"$python_bin" -m exhibition.mac --worker --user-id 2 --port 8081 --config "$state_dir/mac-user2-config.json" "$@" &
user2_pid=$!
frontend_pid=
bridge_pid=
cleanup() {
  kill "$user1_pid" "$user2_pid" 2>/dev/null || true
  if [ -n "$frontend_pid" ]; then kill "$frontend_pid" 2>/dev/null || true; fi
  if [ -n "$bridge_pid" ]; then kill "$bridge_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if "$python_bin" -c 'from exhibition.startup import server_settings; import sys; sys.exit(0 if server_settings().get("example_frontend", False) else 1)'; then
  node_bin="${EYE_NODE:-$(command -v node || true)}"
  if [ -z "$node_bin" ] && [ -x "$repo_dir/.node/bin/node" ]; then node_bin="$repo_dir/.node/bin/node"; fi
  if [ -z "$node_bin" ] && [ -x "$HOME/Library/Application Support/EyeTracker-pi/app/.node/bin/node" ]; then
    node_bin="$HOME/Library/Application Support/EyeTracker-pi/app/.node/bin/node"
  fi
  if [ ! -x "$node_bin" ]; then echo 'Node.js 실행 경로를 EYE_NODE로 지정하세요.' >&2; exit 1; fi
  "$python_bin" -m exhibition.frontend &
  bridge_pid=$!
  (cd exhibition/frontend-example && PORT=5173 "$node_bin" server.js) &
  frontend_pid=$!
fi
"$python_bin" -c 'from exhibition.startup import announce; announce()'
# A failed worker stops the pair so the terminal cannot claim the server is healthy.
while kill -0 "$user1_pid" 2>/dev/null && kill -0 "$user2_pid" 2>/dev/null; do
  if [ -n "$frontend_pid" ] && ! kill -0 "$frontend_pid" 2>/dev/null; then break; fi
  if [ -n "$bridge_pid" ] && ! kill -0 "$bridge_pid" 2>/dev/null; then break; fi
  sleep 1
done
echo '처리 서버가 종료되어 compute server 전체를 종료합니다.' >&2
exit 1
