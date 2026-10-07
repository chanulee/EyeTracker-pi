#!/usr/bin/env bash
# 전시용 Chrome 실행 (모니터 1대 구성).
#
# Chrome 을 두 인스턴스(프로필 2개)로 띄운다.
#   1) 전시 창      /pre_opening   --kiosk  전체화면. 탭·주소창 없음, 페이지 이동·오류 복구 중에도 전체화면이 풀리지 않음.
#   2) 인원 인식 창 /presence_test --app    주소창 없는 작은 창. 바탕화면 데스크톱에 남는다.
#
# 왜 인스턴스를 나누나: --kiosk 는 그 인스턴스의 모든 창을 전체화면으로 만들기 때문에,
# 인식 창까지 전체화면이 되지 않게 별도 인스턴스로 띄운다. (프로필 폴더가 다르면 별도 인스턴스다.)
#
# Chrome 은 다른 창에 가려지거나 다른 데스크톱(Space)에 있는 창을 "숨김"으로 보고 타이머를 초당 1회로 제한한다.
# 그러면 /presence_test 의 100ms 판정 루프가 멈추다시피 하므로, 두 인스턴스 모두 아래 플래그로 그 제한을 끈다.
# 플래그는 Chrome 인스턴스가 처음 뜰 때만 적용되기 때문에 전용 프로필(--user-data-dir)을 쓰고,
# 이미 떠 있는 전시용 인스턴스는 먼저 종료한다. 평소 쓰는 Chrome 은 건드리지 않는다.
#
# 사용:  bash scripts/launch-kiosk.sh          실행
#        bash scripts/launch-kiosk.sh stop     전시용 Chrome 두 개 모두 종료
# 환경변수로 바꿀 수 있는 값:
#   KIOSK_URL      서버 주소            (기본 http://localhost:3000)
#   KIOSK_PROFILE  전용 프로필 폴더     (기본 ~/.seoul-kiosk-chrome, 아래에 display/ sensor/ 가 생긴다)
#   PRESENCE_SIZE  인식 창 크기 "W,H"   (기본 960,640)
#   PRESENCE_POS   인식 창 위치 "X,Y"   (기본 40,40)
#   CHROME_APP     Chrome 앱 번들 경로  (기본 /Applications/Google Chrome.app)
#   KIOSK_DEBUG=1  전시 창 왼쪽 아래에 센서 상태(얼굴 수·통과 인원·진행률)를 띄운다.
#                  인식 창이 전체화면 뒤에 가려져 있어도 왜 안 넘어가는지 볼 수 있다.
#                  오른쪽 아래에는 무활동 복귀 상태(마지막 활동과 그 원인)가 뜬다.
#
# 전체화면 고정: 전시 창의 전체화면이 풀리면 곧바로 다시 켠다(Cmd+Ctrl+F, 초록 버튼, 메뉴 등 무엇으로 풀려도).
# Fn(지구본)+F 로 끈 경우만 의도한 해제로 보고 그대로 두며, 다시 Fn+F 로 켜면 감시를 이어 간다.
# 창 상태를 읽고 바꾸려면 이 스크립트를 실행한 앱(터미널 등)에 손쉬운 사용 권한이 있어야 한다.
#   시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용 → 터미널 켜기
# 감시 기록: $KIOSK_PROFILE/fullscreen-guard.log
#
# 전시 창은 macOS 전체화면이라 별도 데스크톱(Space)에 뜬다. 인식 창을 보려면 트랙패드 세 손가락 좌우 스와이프
# 또는 Ctrl+←/→ 로 바탕화면 데스크톱으로 넘어가면 된다. 전시 창에서 Cmd+Q 를 누르면 전시 창만 꺼지므로,
# 둘 다 끄려면 `bash scripts/launch-kiosk.sh stop`.

set -euo pipefail

CHROME_APP="${CHROME_APP:-/Applications/Google Chrome.app}"
BASE_URL="${KIOSK_URL:-http://localhost:3000}"
PROFILE_ROOT="${KIOSK_PROFILE:-$HOME/.seoul-kiosk-chrome}"
DISPLAY_PROFILE="$PROFILE_ROOT/display"
SENSOR_PROFILE="$PROFILE_ROOT/sensor"
PRESENCE_SIZE="${PRESENCE_SIZE:-960,640}"
PRESENCE_POS="${PRESENCE_POS:-40,40}"
DISPLAY_URL="$BASE_URL/pre_opening"
if [ "${KIOSK_DEBUG:-0}" = "1" ]; then
  DISPLAY_URL="$DISPLAY_URL?presenceDebug=1&idleDebug=1"
else
  # idleDebug 는 브라우저에 기억되므로, 디버그 없이 띄울 때는 꺼 둔다.
  DISPLAY_URL="$DISPLAY_URL?idleDebug=0"
fi
GUARD_PID_FILE="$PROFILE_ROOT/fullscreen-guard.pid"
GUARD_LOG="$PROFILE_ROOT/fullscreen-guard.log"

# 전시 창 전체화면 감시(JXA). 인자: 전시 Chrome 메인 프로세스 PID.
# Fn 은 macOS 가 가로채서 Chrome 이 받지 못하므로, 키 상태를 직접 읽어 풀린 직전에 Fn 이 눌렸는지 본다.
read -r -d '' GUARD_JS <<'JXA' || true
ObjC.import('CoreGraphics');
function run(argv) {
  const pid = Number(argv[0]);
  const FN_MASK = 0x800000;
  const FN_WINDOW_MS = 1500;
  const events = Application('System Events');
  const log = (text) => console.log(new Date().toISOString() + ' ' + text);
  let lastFnAt = 0;
  let armed = false;
  let paused = false;
  let tick = 0;
  let lastError = '';
  log('감시 시작 pid=' + pid);
  for (;;) {
    if ($.CGEventSourceFlagsState(1) & FN_MASK) lastFnAt = Date.now();
    if (tick++ % 3 === 0) {
      const procs = events.processes.whose({ unixId: pid });
      if (procs.length === 0) {
        log('전시 창이 종료되어 감시를 끝냅니다');
        return;
      }
      try {
        const attr = procs[0].windows[0].attributes.byName('AXFullScreen');
        const full = attr.value();
        lastError = '';
        if (full) {
          if (!armed) log('전체화면 확인, 감시 중');
          if (paused) log('Fn+F 로 다시 전체화면, 감시 재개');
          armed = true;
          paused = false;
        } else if (armed && !paused) {
          if (Date.now() - lastFnAt < FN_WINDOW_MS) {
            paused = true;
            log('Fn+F 로 전체화면 해제 → 다시 켤 때까지 대기');
          } else {
            attr.value = true;
            log('전체화면이 풀려서 다시 켰습니다');
          }
        }
      } catch (err) {
        const message = String(err);
        if (message !== lastError) log('창 상태를 읽지 못함(손쉬운 사용 권한 확인): ' + message);
        lastError = message;
      }
    }
    delay(0.1);
  }
}
JXA

stop_guard() {
  if [ -f "$GUARD_PID_FILE" ]; then
    kill "$(cat "$GUARD_PID_FILE")" 2>/dev/null || true
    rm -f "$GUARD_PID_FILE"
  fi
}

stop_kiosk() {
  stop_guard
  if pgrep -f "user-data-dir=$PROFILE_ROOT" >/dev/null; then
    pkill -f "user-data-dir=$PROFILE_ROOT" || true
    sleep 2
    return 0
  fi
  return 1
}

if [ "${1:-}" = "stop" ]; then
  if stop_kiosk; then echo "전시용 Chrome 을 종료했습니다."; else echo "떠 있는 전시용 Chrome 이 없습니다."; fi
  exit 0
fi

if [ ! -d "$CHROME_APP" ]; then
  echo "Chrome 을 찾지 못했습니다: $CHROME_APP" >&2
  exit 1
fi

if ! curl -fsS -o /dev/null --max-time 3 "$BASE_URL/presence_test"; then
  echo "서버가 응답하지 않습니다: $BASE_URL" >&2
  echo "먼저 프로젝트 폴더에서 'yarn dev' 를 실행하세요." >&2
  exit 1
fi

if stop_kiosk; then
  echo "이미 떠 있던 전시용 Chrome 을 종료했습니다."
fi
mkdir -p "$DISPLAY_PROFILE" "$SENSOR_PROFILE"

COMMON=(
  # 가려진 창·백그라운드 창·다른 데스크톱의 창에 걸리는 타이머/렌더러 제한 해제 (인원 인식 창이 계속 돌게)
  --disable-background-timer-throttling
  --disable-renderer-backgrounding
  --disable-backgrounding-occluded-windows
  # 카메라·마이크 권한 창 없이 바로 허용, 영상·음성 자동 재생 허용
  --use-fake-ui-for-media-stream
  --autoplay-policy=no-user-gesture-required
  # 첫 실행 안내·기본 브라우저 확인·복구 안내 말풍선 끄기
  --no-first-run
  --no-default-browser-check
  --disable-session-crashed-bubble
  --hide-crash-restore-bubble
)

wait_for_instance() { # <profile dir>
  for _ in $(seq 1 20); do
    pgrep -f "user-data-dir=$1" >/dev/null && return 0
    sleep 0.5
  done
  return 1
}

# `open` 으로 띄우면 launchd 가 Chrome 을 띄워 주므로, 이 스크립트(터미널)가 닫혀도 Chrome 은 남는다.
# 인식 창을 먼저, 전시 창을 나중에 띄워서 마지막에 뜬 전시 창(전체화면 데스크톱)이 화면에 남게 한다.
echo "인원 인식 창 실행: $BASE_URL/presence_test (앱 창 ${PRESENCE_SIZE} @ ${PRESENCE_POS})"
open -na "$CHROME_APP" --args --user-data-dir="$SENSOR_PROFILE" "${COMMON[@]}" \
  --app="$BASE_URL/presence_test" --window-size="$PRESENCE_SIZE" --window-position="$PRESENCE_POS"
wait_for_instance "$SENSOR_PROFILE" || echo "경고: 인식 창 프로세스를 확인하지 못했습니다." >&2
sleep 2

echo "전시 창 실행: $DISPLAY_URL (kiosk 전체화면)"
open -na "$CHROME_APP" --args --user-data-dir="$DISPLAY_PROFILE" "${COMMON[@]}" --kiosk "$DISPLAY_URL"
wait_for_instance "$DISPLAY_PROFILE" || echo "경고: 전시 창 프로세스를 확인하지 못했습니다." >&2

# 도우미 프로세스도 같은 user-data-dir 을 달고 뜨므로, 메인 실행 파일 경로로 전시 창 본체만 고른다.
DISPLAY_PID="$(pgrep -f "MacOS/Google Chrome --user-data-dir=$DISPLAY_PROFILE" | head -n 1 || true)"
if [ -n "$DISPLAY_PID" ]; then
  nohup osascript -l JavaScript -e "$GUARD_JS" "$DISPLAY_PID" >>"$GUARD_LOG" 2>&1 &
  echo $! >"$GUARD_PID_FILE"
  echo "전체화면 감시 시작 (Fn+F 로만 해제됨 · 기록: $GUARD_LOG)"
else
  echo "경고: 전시 창 PID 를 찾지 못해 전체화면 감시를 켜지 못했습니다." >&2
fi

echo "완료. 인식 창은 바탕화면 데스크톱에 있습니다(Ctrl+← 로 이동). 모두 끄려면: bash scripts/launch-kiosk.sh stop"
