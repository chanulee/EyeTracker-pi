#!/usr/bin/env bash
# 전시 상주 직원용. Finder 에서 더블클릭하면 전시 창·인식 창·서버를 모두 끈다.

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

STATE_DIR="$HOME/.seoul-kiosk-chrome"
SERVER_PID="$STATE_DIR/server.pid"

echo "■ 전시를 종료합니다."
./scripts/launch-kiosk.sh stop

# yarn 이 띄운 node 는 yarn 과 별개 프로세스라, 3000번을 듣고 있는 이 프로젝트의 서버를 직접 끈다.
for pid in $(lsof -ti tcp:3000 -sTCP:LISTEN 2>/dev/null); do
  if ps -o command= -p "$pid" | grep -q "server.js"; then
    kill "$pid" 2>/dev/null
  fi
done
if [ -f "$SERVER_PID" ]; then
  kill "$(cat "$SERVER_PID")" 2>/dev/null
  rm -f "$SERVER_PID"
fi
echo "  서버를 껐습니다."

echo
echo "✅ 전시가 종료되었습니다. 이 창은 닫아도 됩니다."
