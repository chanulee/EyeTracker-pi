#!/usr/bin/env bash
# 전시 상주 직원용. Finder 에서 더블클릭하면 서버를 켜고(꺼져 있을 때만) 전시 창을 띄운다.
# 서버는 뒤에서 돌기 때문에 이 터미널 창을 닫아도 전시는 계속된다. 끌 때는 '전시 종료.command'.

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

URL="http://localhost:3000"
STATE_DIR="$HOME/.seoul-kiosk-chrome"
SERVER_LOG="$STATE_DIR/server.log"
SERVER_PID="$STATE_DIR/server.pid"
# 서버가 처음 화면을 준비하는 데 걸리는 최대 시간(초).
WAIT_SECONDS=120

mkdir -p "$STATE_DIR"

fail() {
  echo
  echo "❌ $1"
  echo "   이 창을 캡처해서 담당자에게 보내 주세요. (기록: $SERVER_LOG)"
  read -r -p "엔터를 누르면 창이 닫힙니다…" _
  exit 1
}

server_up() {
  curl -fs -o /dev/null --max-time 3 "$URL/presence_test"
}

# 3000번을 잡고 있는데 페이지를 못 주는 이 프로젝트 서버(캐시가 깨진 개발 서버 등)를 끈다.
stop_stale_server() {
  for pid in $(lsof -ti tcp:3000 -sTCP:LISTEN 2>/dev/null); do
    if ps -o command= -p "$pid" | grep -q "server.js"; then
      kill "$pid" 2>/dev/null
    fi
  done
  for _ in $(seq 1 10); do
    lsof -ti tcp:3000 -sTCP:LISTEN >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  return 1
}

echo "▶ 전시를 시작합니다."

if server_up; then
  echo "  서버가 이미 켜져 있습니다."
else
  if ! command -v yarn >/dev/null; then
    fail "yarn 을 찾지 못했습니다."
  fi
  if lsof -ti tcp:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "  응답하지 않는 서버를 끄는 중…"
    stop_stale_server || fail "3000번 포트를 다른 프로그램이 쓰고 있습니다."
  fi
  echo "  서버를 켜는 중… (처음에는 1분 정도 걸릴 수 있어요)"
  # 깨진 개발 캐시가 남아 있으면 모든 페이지가 404 가 되므로, 새로 켤 때는 지우고 시작한다.
  rm -rf .next
  ulimit -n 10240 2>/dev/null
  # 새 세션으로 떼어 내서, 터미널 창을 닫을 때 함께 오는 종료 신호를 받지 않게 한다.
  nohup perl -MPOSIX=setsid -e 'setsid(); exec @ARGV' yarn dev >>"$SERVER_LOG" 2>&1 </dev/null &
  echo $! >"$SERVER_PID"
  ready=0
  for _ in $(seq 1 "$WAIT_SECONDS"); do
    if server_up; then
      ready=1
      break
    fi
    if ! kill -0 "$(cat "$SERVER_PID")" 2>/dev/null; then
      fail "서버가 켜지다가 멈췄습니다."
    fi
    sleep 1
  done
  [ "$ready" = 1 ] || fail "서버가 ${WAIT_SECONDS}초 안에 준비되지 않았습니다."
  # 전시 첫 화면을 미리 한 번 불러 두어, 전시 창이 뜨자마자 바로 보이게 한다.
  curl -fs -o /dev/null --max-time 60 "$URL/pre_opening" || true
  echo "  서버 준비 완료."
fi

./scripts/launch-kiosk.sh || fail "전시 창을 띄우지 못했습니다."

echo
echo "✅ 전시가 시작되었습니다. 이 창은 닫아도 됩니다."
