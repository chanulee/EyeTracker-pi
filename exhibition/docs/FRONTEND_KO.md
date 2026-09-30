# 웹 프론트엔드 학생 전달 매뉴얼

Mac에서 영상 처리·개인별 보정·안정화를 끝낸 결과를 WebSocket으로 받습니다. Pi에 직접 연결하거나 브라우저에서 보정 모델을 다시 계산할 필요가 없습니다.

## 연결

1. Mac 서버 실행: `bash start-mac.sh --two-users`. 사용자 1은 8080, 사용자 2는 8081입니다.
2. `http://localhost:8080`, `http://localhost:8081` 각각에서 해당 관람객의 보정을 완료합니다.
3. **두 Mac 운영 화면 모두** 설정에 프론트엔드 Origin을 정확히 등록합니다. 예: `http://localhost:5173`. 포트까지 같아야 하고 경로/끝 슬래시는 붙이지 않습니다.
4. 같은 Mac의 프론트엔드: 사용자 1 `ws://localhost:8080/gaze`, 사용자 2 `ws://localhost:8081/gaze`. 다른 기기에서는 localhost를 Mac의 LAN 주소로 바꿉니다. 두 연결을 동시에 구독하는 예시는 [README](../README.md)에 있습니다.

제공 클라이언트 [gaze-client.js](../web/gaze-client.js)를 웹 프로젝트에 복사해 import하세요. 연결 끊김 시 재접속하며 500ms 무응답 시 무효 좌표를 전달합니다. 타이머 종료를 위해 컴포넌트 unmount 때 반환 함수를 호출합니다.

```javascript
import { connectGaze } from './gaze-client.js';

const disconnect = connectGaze('ws://localhost:8080/gaze', gaze => {
  if (!gaze.valid) {
    cursor.hidden = true;
    resetDwell(); // 검출 실패/보정 중/연결 끊김: 선택 누적 중단
    return;
  }
  cursor.hidden = false;
  cursor.style.left = `${gaze.x * window.innerWidth}px`;
  cursor.style.top = `${gaze.y * window.innerHeight}px`;
  updateInteraction(gaze.x, gaze.y);
});
// 컴포넌트 종료 시 disconnect();
```

`cursor`는 `position:fixed; pointer-events:none; transform:translate(-50%,-50%)`를 사용합니다. `resetDwell`, `updateInteraction`은 학생의 작품에서 구현할 함수입니다. 좌표로 운영체제 마우스를 이동시키거나 자동 클릭하지 않습니다.

## 메시지 계약 v1

약 30Hz로 최신 상태를 보내며 추론 FPS와 같다는 뜻은 아닙니다. `seq`와 `session_id`는 사용자별 상태입니다. 1번의 무효화/재보정은 2번의 커서나 dwell을 초기화하지 않습니다. 같은 `seq`가 반복될 수 있으므로 **새 시선 샘플 수를 세려면 seq를 비교**하세요. `valid:false` 상태 변화는 seq가 같아도 처리하세요.

```json
{
  "type": "gaze", "version": 1, "user_id": 1, "seq": 123,
  "timestamp_ms": 1790000000000, "session_id": "example",
  "valid": true, "tracking": true, "calibrated": true, "ready": true,
  "x": 0.42, "y": 0.61,
  "raw": [-0.08, -0.12],
  "direction": [-0.08, -0.12, 0.9895],
  "origin": [0.0, 0.0, 0.0],
  "pupil": {"center": [280.0, 290.0], "axes": [70.0, 90.0], "angle_degrees": 20.0},
  "confidence": 0.9, "frame_age_ms": 28,
  "camera_connected": true, "error": null
}
```

| 필드 | 의미 |
|---|---|
| `user_id` | 사용자 번호 1 또는 2. 연결별로 고정되고 보정 세션과 별개 |
| `valid` | 지금 인터랙션에 써도 되는 화면 좌표. 유일한 선택 허용 기준 |
| `x/y` | 안정화된 0–1 좌표. (0,0) 왼쪽 위 / (1,1) 오른쪽 아래. 무효면 둘 다 null |
| `tracking` | 최근 영상에서 유효 동공을 검출. 보정 전에도 true일 수 있음 |
| `calibrated` | 이번 관람객의 9점 보정과 중앙 검증 완료 |
| `session_id` | 관람객/보정 세션. 바뀌면 dwell 등 인터랙션 상태 초기화 |
| `seq` | Mac이 처리한 영상 번호. 서버 수신 이후 기준이며 Pi 캡처 번호가 아님 |
| `timestamp_ms` | 메시지 생성 시 Mac의 Unix 시각. 카메라 캡처 시각이 아님 |
| `frame_age_ms` | Mac이 마지막 처리를 완료한 뒤 경과 시간. 전체 촬영→화면 지연 측정값이 아님 |
| `raw` | 방향 벡터 x/y 성분, 보정 수집용. 화면 좌표가 아님 |
| `direction` | 기존 3D 모델의 정규화 추정 방향. 트래커 좌표축이고 실제 공간 방향/각도 보장 없음 |
| `origin` | 기존 가상 눈 모델의 중심. 미터 단위 아님 |
| `pupil` | 크롭/리사이즈된 640×480 트래커 입력에서의 동공 타원 |
| `confidence` | 동공 마스크 품질 비율, 확률 아님 |
| `ready` | 유효 동공 및 눈 모델 준비 완료. 개인별 보정 시작 가능 |
| `error` | 현재 검출/연결 안내. 정상 시 null |

페이지 전환 후 재연결해도 Mac 메모리의 같은 모델을 사용합니다. 실제 작품에서 사용하는 화면 크기·비율·좌석을 유지하세요. 보정 UI의 전체 화면 영역과 최종 작품의 전체 화면이 동일해야 합니다. 작품이 화면 일부만 사용하면 `x*innerWidth - 영역.left`처럼 화면 좌표에서 영역 좌표로 변환합니다. 별도의 페이지가 화면 크기를 바꾸면 운영자가 새 보정을 해야 합니다. 프로토타입은 자신의 resize 시 자동 초기화합니다.

## 운영 API (Mac localhost 전용)

프론트엔드는 기본적으로 `/gaze`만 받습니다. 관리/보정은 Mac 운영 화면을 사용하세요. LAN 클라이언트에는 설정 토큰/눈 영상/API를 공개하지 않습니다. POST는 운영 화면과 같은 Origin을 요구합니다.

| 경로 | 기능 |
|---|---|
| `GET /api/status` | 상태 및 보정 수집 지점 수 |
| `GET /api/config` / `POST /api/config` | Origin 목록, 안정화, 품질 기준, 회전. POST는 변경할 필드만 전송 |
| `POST /api/calibration` | 아래 보정 명령 |
| `GET /preview.jpg` | 최신 눈 JPEG (350ms 이상 오래되면 503) |
| `POST /api/demo` | `--simulate` 모드에서만 `{x:0..1,y:0..1}` 테스트 입력 |

보정 명령은 JSON입니다. `reset`: 새 관람객/눈 모델 초기화. 눈을 여러 방향으로 움직여 `ready:true`가 되면 `begin`: 눈 모델 고정 + session_id 반환. `sample`은 `index:0..8, session_id`와 함께 호출합니다. 지점 순서는 위쪽 왼쪽→중앙→오른쪽, 가운데 행, 아래 행입니다. 호출 전 대상 점을 보여주고 0.9초 대기하세요. 서버가 호출 후 1.2초 동안 수집합니다. 마지막에는 중앙을 보여주고 같은 방식으로 `validate, session_id`를 호출합니다. `cancel`은 보정/모델을 폐기합니다. 실패는 400과 오류 텍스트이며 같은 지점을 재시도하거나 reset으로 재시작합니다. 같은 사용자의 보정을 중복 진행하지 마세요. 사용자별 보정 상태는 독립적입니다. 한 화면을 공유할 때는 두 관람객의 보정을 순서대로 진행합니다.

## 배포 조건

이 프로토타입은 같은 Wi-Fi에서 로컬 HTTP 프론트엔드를 실행하는 구성을 제공합니다. 공개 HTTPS 웹페이지에서 로컬 `ws://`를 여는 구성은 브라우저의 mixed-content/로컬 네트워크 정책에 의해 제한될 수 있습니다. 공개 배포가 필요하면 Mac 서버 앞에 신뢰 가능한 TLS 역방향 프록시를 두고 `/gaze`를 WSS로 제공하거나, 로컬에서 작품을 HTTP로 실행하세요. Pi `/camera`도 원격 네트워크라면 WSS가 필요합니다. 현재 TLS·공개 사이트 호스팅·외부 프록시는 설치 스크립트 범위에 포함하지 않습니다. Origin 허용은 인증 수단이 아니므로 불특정 네트워크에 좌표 API를 공개하지 마세요.

실행 예제는 [프로토타입](../web/index.html), 재접속/무응답 처리는 [공통 클라이언트](../web/gaze-client.js)를 참고하세요. WebSocket HTTP 서버 구현은 [aiohttp 공식 문서](https://docs.aiohttp.org/en/stable/web_quickstart.html)를 따릅니다.

## 통합 관리자와 1P / 2P 구독 토큰

Mac mini의 `http://localhost:8080/admin`에서 두 사용자의 상태와 연결 설정을 관리합니다. 영상 전송 토큰(`token`)은 Pi에만 저장합니다. 별도 시선 구독 토큰(`gaze_token`)은 작품 프론트엔드에 전달합니다. 관리자에서 사용자별로 “작품 구독에 토큰 요구”를 켜면 `/gaze?token=시선구독토큰`만 허용합니다. 기본값은 꺼짐이므로 기존 작품과 호환됩니다. Origin 허용 설정은 토큰 사용 여부와 관계없이 필요합니다. 인증 설정이 변경되면 기존 구독은 끊기고 클라이언트가 재접속합니다.

아래처럼 공통 클라이언트의 네 번째 인자로 토큰을 전달합니다. 작품에는 Pi 토큰이나 `/api/config` 접근을 넣지 않습니다. 관리자에게 받은 시선 구독 토큰을 작품의 로컬 설정으로 전달하세요. 예제 문자열은 실제 토큰으로 바꿉니다. 토큰을 공개 저장소에 커밋하지 않습니다.

```javascript
import { connectGaze } from './gaze-client.js';

const tokens = { 1: '1P 시선 구독 토큰', 2: '2P 시선 구독 토큰' };
const cursors = { 1: document.querySelector('#cursor1'), 2: document.querySelector('#cursor2') };
const sessions = {};
const stops = [1, 2].map(id => connectGaze(
  `ws://localhost:${id === 1 ? 8080 : 8081}/gaze`,
  gaze => {
    if (sessions[id] !== gaze.session_id) {
      sessions[id] = gaze.session_id;
      resetDwell(id); // 작품에서 구현: 이 사용자의 선택 누적을 초기화
    }
    const cursor = cursors[id];
    cursor.hidden = !gaze.valid;
    if (!gaze.valid) { resetDwell(id); return; }
    // 두 사용자 모두 같은 뷰포트 전체를 사용합니다.
    cursor.style.left = `${gaze.x * innerWidth}px`;
    cursor.style.top = `${gaze.y * innerHeight}px`;
  },
  status => console.log(`${id}P`, status),
  { token: tokens[id] }
));
// 종료 시 stops.forEach(stop => stop());
```

두 커서에 `position:fixed; pointer-events:none; transform:translate(-50%,-50%)`를 적용하고 색/1P·2P 라벨로 구분하세요. 시선이 끊긴 사용자의 커서만 숨기고 그 사용자의 선택 누적만 초기화합니다. 확인용 `http://localhost:8080/stage`가 같은 방식으로 두 좌표를 표시합니다. 2P 서버는 이 확인 화면의 로컬 Origin `http://localhost:8080`을 허용합니다. 별도 작품 Origin은 두 사용자 설정에 등록해야 합니다.

추가 localhost 관리자 경로는 `/admin`, `/stage`, `/api/player2/status`, `/api/player2/config`, `/api/player2/preview`, `/api/player2/calibration`입니다. 1P 서버가 고정된 로컬 8081 포트의 2P 상태를 중계합니다. LAN에서는 이 관리 경로를 사용할 수 없습니다. `/api/status`는 `subscribers`, `processing_fps`, `processing_ms`, `calibrating`도 제공합니다. FPS는 최근 2초 내 최대 60개 처리 프레임의 간격으로 계산하고, 처리 시간은 JPEG 해독과 추론을 포함합니다. Wi-Fi RSSI와 촬영부터 화면 표시까지의 지연은 측정하지 않습니다. 시뮬레이션에서는 눈 영상과 실제 추론 처리 시간이 없습니다.

## 교체 가능한 별도 예시 프론트엔드

기본 실행은 별도 HTTP 프로세스의 `http://localhost:5173`에 예시 작품을 제공합니다. 작품 파일은 `exhibition/frontend-example/index.html`이며 두 사용자의 `/gaze`를 동시에 구독합니다. [예시 교체 안내](../frontend-example/README.md)를 참고하세요. 이 프론트엔드는 관리자나 compute API에 작품 코드를 넣지 않습니다. 화면 파일만 교체하거나 `--frontend-url URL`로 자신의 프론트엔드 서버로 바꿀 수 있습니다. 내장 예시의 localhost `/connection.json`은 시선 구독 토큰만 제공하고 Pi 영상 전송 토큰은 제공하지 않습니다.
