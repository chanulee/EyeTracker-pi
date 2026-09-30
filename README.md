# 전시용 Eye Cursor — 사용자 2명 / Pi 2대 / Mac mini 1대

현재 전시용 Mac에는 실행 환경이 설치되어 있습니다. 저장소 루트에서 `bash start-mac.sh --two-users`를 실행하고 [통합 관리자](http://localhost:8080/admin)를 엽니다. Pi 연결과 관람객 보정은 별도로 진행합니다. 이 Mac의 설치 상태와 시작·종료 방법은 [Mac mini 안내](exhibition/docs/MAC_MINI_KO.md)에 있습니다.

저장소는 **`exhibition/` — 현재 전시에 필요한 모든 것**, **`legacy/` — 현재 전시에서 사용하지 않는 원본 실험과 이전 데모**로 나뉩니다. 루트 `start-mac.sh`는 Mac 실행 진입점입니다. [문서 목록](exhibition/docs/README.md)과 [폴더 이동표](exhibition/docs/REPOSITORY_KO.md)를 참고하세요.

관람객마다 **Pi Zero 2 W + USB/UVC GC0308 눈 카메라 한 세트**를 사용합니다. Pi 두 대가 같은 전시 네트워크를 통해 Mac mini 한 대에 영상을 보내고, Mac이 사용자별 눈 방향·캘리브레이션·좌표 안정화를 처리합니다. 웹 작품은 두 사용자의 좌표를 각각 구독합니다.

```text
1번 관람객 · 눈 카메라 → eye-pi-1 ──Wi-Fi / WebSocket──→ Mac mini :8080 → 사용자 1 좌표
2번 관람객 · 눈 카메라 → eye-pi-2 ──Wi-Fi / WebSocket──→ Mac mini :8081 → 사용자 2 좌표
                                                                  └→ 웹 작품의 두 커서
```

Mac 서버를 사용자별로 따로 실행하므로 눈 모델, 보정값, 필터, 연결 토큰, 관람객 세션이 분리됩니다. **1번 관람객을 새로 보정하거나 Pi 1번이 끊겨도 2번 보정값은 유지됩니다.** 두 Pi를 같은 수신 포트에 연결하면 두 번째 연결은 거부됩니다.

전시 운영자는 **[통합 관리자](http://localhost:8080/admin)**에서 두 사용자의 눈 영상, 동공 추출, 모델 준비, 보정 여부, Pi 연결, 처리 FPS/시간과 시선 구독 수를 함께 확인합니다. Mac mini는 하나의 compute server 역할을 하며, 내부적으로 독립된 1P/2P 처리 프로세스를 실행합니다. 별도 개발하는 작품 프론트엔드는 두 좌표 스트림을 받아 **같은 화면 전체에 두 커서**를 표시합니다. 사용자 번호가 화면의 왼쪽/오른쪽 영역을 뜻하지 않습니다.

**[두 커서 확인 화면](http://localhost:8080/stage)**은 하늘색 1P, 주황색 2P가 하나의 화면을 사용하는 연결 확인용 페이지입니다. 최종 작품을 대신하지 않습니다. 두 사용자의 보정은 기존 8080/8081 운영 화면에서 차례로 진행합니다.

## 1. Pi 두 대 준비

Raspberry Pi Imager에서 각 Pi에 Raspberry Pi OS Lite를 기록하면서 사용자 계정, 전시장 **2.4 GHz Wi-Fi**, SSH를 설정합니다. hostname은 서로 다르게 지정하세요.

| 설정 | 사용자 1 | 사용자 2 |
|---|---|---|
| Pi hostname | `eye-pi-1` | `eye-pi-2` |
| Mac에서 SSH 접속 | `ssh <사용자>@eye-pi-1.local` | `ssh <사용자>@eye-pi-2.local` |
| Pi 설정 화면 | `http://eye-pi-1.local:8000` | `http://eye-pi-2.local:8000` |

두 Pi의 설정 UI 포트는 모두 8000이어도 됩니다. 서로 다른 기기이기 때문입니다. 카메라를 각 Pi의 USB 데이터 포트에 연결하세요. 같은 네트워크라도 게스트 Wi-Fi의 기기 간 통신 차단이 있으면 연결되지 않을 수 있습니다.

**각 Pi에 SSH 접속한 뒤**, 같은 한 줄 설치 명령을 각각 실행합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/chanulee/EyeTracker-pi/main/install.sh -o /tmp/eye-install.sh && bash /tmp/eye-install.sh
```

이 명령은 **이번 변경사항이 공개 GitHub `main`에 올라간 후** 사용할 수 있습니다. 다운로드, 패키지 설치, `eye-pi.service` 등록, 부팅 자동실행까지 처리합니다. 설치 때 출력되는 각 Pi의 UI 로그인 정보 (`admin` / 생성된 비밀번호)를 기록하세요. 두 Pi의 비밀번호는 각각 생성됩니다.

## 2. Mac mini에서 두 사용자 서버 시작

저장소 루트에서 실행합니다. Python 3.10 이상이 필요하며 새 Mac에서는 첫 실행 때 필요한 라이브러리를 설치합니다. 현재 전시용 Mac의 `.venv`에는 이미 설치되어 있습니다. 기존 단일 사용자 서버가 실행 중이면 먼저 종료해 8080/8081 포트를 비워주세요.

```bash
bash start-mac.sh --two-users
```

| 항목 | 사용자 1 | 사용자 2 |
|---|---|---|
| Mac 운영·보정 화면 | `http://localhost:8080` | `http://localhost:8081` |
| Mac 설정 파일 | `exhibition/mac-config.json` | `exhibition/mac-user2-config.json` |
| Pi UI에 저장할 수신 주소 | `ws://Mac의WiFiIP:8080/camera` | `ws://Mac의WiFiIP:8081/camera` |
| 웹 작품이 구독할 주소 | `ws://localhost:8080/gaze` | `ws://localhost:8081/gaze` |
| 메시지 `user_id` | `1` | `2` |

설정 파일은 자동 생성되고 Git에서 제외됩니다. 이전 단일 사용자 설정은 사용자 1에서 그대로 사용합니다. Mac 방화벽에서 Python의 수신을 허용하고 두 포트가 모두 접근 가능한지 확인하세요. Ctrl+C로 두 서버를 함께 종료합니다. Pi는 부팅 자동실행하며, Mac 서버는 현재 이 명령으로 직접 시작합니다.

장비 없이 두 운영 화면을 시험하려면:

```bash
bash start-mac.sh --two-users --simulate
```

각 운영 화면에서 마우스로 보정 점을 따라갑니다. 시뮬레이션은 실제 카메라 정확도 검증이 아닙니다.

## 3. 각 Pi를 올바른 사용자에 연결

1. Mac의 `http://localhost:8080`에서 사용자 1 연결 토큰을 복사합니다.
2. `http://eye-pi-1.local:8000`에서 **8080 수신 주소와 사용자 1 토큰**을 저장합니다.
3. Mac의 `http://localhost:8081`에서 사용자 2 연결 토큰을 복사합니다.
4. `http://eye-pi-2.local:8000`에서 **8081 수신 주소와 사용자 2 토큰**을 저장합니다.
5. 각 Pi에서 “카메라 정상 / Mac 연결됨”, 각 Mac 운영 화면에서 해당 눈 영상을 확인합니다.

Pi에 저장하는 Mac 주소는 Pi에서 접근 가능한 Wi-Fi IP나 hostname입니다. `localhost`를 쓰면 안 됩니다. 가능하면 공유기에서 Mac의 DHCP 주소를 예약하세요. 토큰이나 포트를 뒤바꾸면 연결되지 않습니다. Pi 설정 UI는 카메라 번호, 해상도, FPS, 압축 품질, 회전, 수신 주소와 토큰을 저장합니다. OS Wi-Fi 설정은 포함하지 않습니다.

## 4. 두 관람객 보정·교체

각 사용자 운영 화면에서 **새 관람객 → 눈을 여러 방향으로 움직여 모델 준비 → 전체 화면 → 개인별 9점 보정 → 중앙 검증**을 진행합니다. 지정 좌석이어도 관람객마다 보정합니다.

- 한 화면을 함께 쓰면 사용자 1, 사용자 2 순서로 보정하세요. 같은 브라우저 창의 두 탭을 사용하고, 브라우저 자체를 전체 화면으로 만든 뒤 두 보정 탭과 작품 탭을 같은 크기로 유지합니다. 각 페이지의 “전체 화면” 버튼은 별도 화면에서 사용할 때 사용하세요. 두 사람 모두 최종 작품과 같은 화면 크기·위치·자세에서 보정합니다.
- 관람객이 1번 자리만 바뀌면 **8080 화면에서만** 새 관람객과 재보정을 진행합니다. 2번도 동일하게 8081에서 처리합니다.
- 각 카메라는 해당 눈에 대해 고정해야 합니다. 현재 구성은 머리 이동이나 멀리서 찍은 얼굴 전체를 추적하지 않습니다.
- 각 사용자의 동공 검출 실패나 350ms 이상 오래된 영상은 그 사용자의 `valid:false, x:null, y:null`로 전달됩니다. 해당 커서의 선택 누적만 멈추세요.
- Pi 재연결 또는 해당 Mac 서버 재시작 후에는 그 사용자 보정이 초기화됩니다.

좌표는 각 보정 화면 전체를 기준으로 0–1입니다. 작품이 좌우로 화면을 나누더라도 사용자 1을 왼쪽, 사용자 2를 오른쪽으로 자동 변환하지 않습니다. 프론트엔드에서 실제 작품 영역에 맞춰 좌표를 변환해야 합니다.

## 5. 웹 담당 학생에게 전달할 내용

**두 Mac 운영 화면 모두** 설정에 작품의 Origin을 등록합니다. 통합 관리자에서도 1P·2P 카드에 각각 저장할 수 있습니다. 예: `http://localhost:5173`. 각 WebSocket의 메시지에는 `user_id:1` 또는 `user_id:2`가 있습니다. 다른 컴퓨터에서 웹 작품을 실행하면 `localhost` 대신 Mac의 LAN 주소를 사용합니다.

[공통 클라이언트](exhibition/web/gaze-client.js)를 웹 프로젝트로 복사해 두 번 연결하세요. 아래 예제는 구독 토큰 요구를 끈 기본 설정입니다. 토큰 요구를 켜면 [토큰 전달 예제](exhibition/docs/FRONTEND_KO.md#통합-관리자와-1p--2p-구독-토큰)처럼 네 번째 인자로 사용자별 시선 구독 토큰을 전달합니다. Pi 영상 전송 토큰은 작품에 전달하지 않습니다.

```javascript
import { connectGaze } from './gaze-client.js';

const cursors = new Map();
const stops = [1, 2].map(userId => connectGaze(
  `ws://localhost:${userId === 1 ? 8080 : 8081}/gaze`,
  gaze => {
    // 재연결/무응답 이벤트에도 이 연결의 사용자 번호를 유지합니다.
    cursors.set(userId, gaze);
    // gaze.valid일 때만 x/y를 사용하고, 무효면 이 사용자의 dwell을 초기화하세요.
    // x/y는 0–1: 화면 픽셀은 x * innerWidth, y * innerHeight입니다.
    renderCursors(cursors); // 작품에서 구현할 함수
  }
));
// 페이지/컴포넌트 종료 시: stops.forEach(stop => stop());
```

프론트엔드 상태는 사용자 번호별로 관리하세요. `seq`와 `session_id`도 사용자별 값입니다. 상세 메시지 계약, 화면 영역 변환, HTTPS/WSS 조건은 [웹 학생 전달 매뉴얼](exhibition/docs/FRONTEND_KO.md)을 참고하세요.

## 문서와 검증

- [Pi 설치 / 자동실행 / Mac 운영 매뉴얼](exhibition/docs/SETUP_KO.md)
- [웹 프론트엔드 학생 전달 매뉴얼 / 메시지 계약](exhibition/docs/FRONTEND_KO.md)
- [폴더별 역할 / 원본과 학생 변경 정리](exhibition/docs/REPOSITORY_KO.md)
- [이 전시용 Mac mini의 설치 상태 / 실행 방법](exhibition/docs/MAC_MINI_KO.md)

```bash
.venv/bin/python -m unittest discover -s exhibition/tests -v
```

전시 코드, 알고리즘, 예전 실험을 폴더별로 정리했습니다. [기존 학생 MJPEG/Windows 데모](legacy/docs/LEGACY_PI_DEMO.md)는 새 WebSocket 운영 경로와 별개입니다. **실제 Pi 두 대·GC0308 두 대·전시장 Wi-Fi에서 동시 FPS, 지연, 보정 정확도, 재부팅을 검증해야 합니다.** 시작값은 각 Pi 320×240 / 20 FPS / JPEG 품질 65이고, 무선 혼잡이나 Mac 부하가 크면 각 Pi 설정에서 FPS·품질을 낮춰 확인하세요.

단일 사용자 개발·기존 사용법도 유지합니다.

```bash
bash start-mac.sh
bash start-mac.sh --simulate
```

원본 프로젝트 소개와 크레딧은 [원본 안내](legacy/docs/UPSTREAM.md)에 보존했습니다.
