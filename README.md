# 전시용 Eye Cursor — 사용자 2명 / Pi 2대 / Mac mini 1대

단안·아래쪽 카메라의 **Pupil Labs 3D 방향 실험**은 `bash start-pupil.sh`로 실행합니다. 이 Mac에 별도 실행 환경을 설치했고, 관리자에 동공 타원·카메라 기준 단위 벡터·정면 기준 상대 각도를 표시합니다. [3D 실험 실행 안내](exhibition/docs/PUPIL3D_KO.md)를 참고하세요. 예시 작품에서 착용 확인·정면 안내·9점 보정·3점 검증 후 두 시선 커서를 사용할 수 있습니다. 현장 정확도·지속 24 FPS 검증은 별도입니다.

현재 전시용 Mac에는 실행 환경과 로그인 자동실행이 설치되어 있습니다. Mac 로그인 후 Pupil 3D 서버와 작품 페이지가 시작됩니다. [통합 관리자](http://localhost:8080/admin)에서 상태를 확인합니다. Pi 연결 설정과 관람객 보정은 별도로 진행합니다. 수동 개발 실행은 자동 서비스를 먼저 중지한 뒤 `bash start-mac.sh` 또는 `bash start-pupil.sh`를 사용합니다. 이 Mac의 설치 상태와 시작·종료 방법은 [Mac mini 안내](exhibition/docs/MAC_MINI_KO.md)에 있습니다.

저장소는 **`exhibition/` — 현재 전시에 필요한 모든 것**, **`legacy/` — 현재 전시에서 사용하지 않는 원본 실험과 이전 데모**로 나뉩니다. 루트 `start-mac.sh`는 Mac 실행 진입점입니다. [문서 목록](exhibition/docs/README.md)과 [폴더 이동표](exhibition/docs/REPOSITORY_KO.md)를 참고하세요.

관람객마다 **Pi Zero 2 W + USB/UVC GC0308 눈 카메라 한 세트**를 사용합니다. Pi 두 대가 같은 전시 네트워크를 통해 Mac mini 한 대에 영상을 보내고, Mac이 사용자별 눈 방향·캘리브레이션·좌표 안정화를 처리합니다. 웹 작품은 두 사용자의 좌표를 각각 구독합니다.

```text
1번 관람객 · 눈 카메라 → eye-pi-1 ──Wi-Fi / WebSocket──→ Mac mini :8080 → 사용자 1 좌표
2번 관람객 · 눈 카메라 → eye-pi-2 ──Wi-Fi / WebSocket──→ Mac mini :8081 → 사용자 2 좌표
                                                                  └→ 웹 작품의 두 커서
```

Mac 서버를 사용자별로 따로 실행하므로 눈 모델, 보정값, 필터, 연결 토큰, 관람객 세션이 분리됩니다. **1번 관람객을 새로 보정하거나 Pi 1번이 끊겨도 2번 보정값은 유지됩니다.** 두 Pi를 같은 수신 포트에 연결하면 두 번째 연결은 거부됩니다.

전시 운영자는 **[통합 관리자](http://localhost:8080/admin)**에서 두 사용자의 눈 영상, 동공 추출, 모델 준비, 보정 여부, Pi 연결, 처리 FPS/시간과 시선 구독 수를 함께 확인합니다. Mac mini는 하나의 compute server 역할을 하며, 내부적으로 독립된 1P/2P 처리 프로세스를 실행합니다. 별도 개발하는 작품 프론트엔드는 두 좌표 스트림을 받아 **같은 화면 전체에 두 커서**를 표시합니다. 사용자 번호가 화면의 왼쪽/오른쪽 영역을 뜻하지 않습니다.

**[예시 작품 프론트엔드](http://localhost:5173)**는 compute server와 별도 프로세스로 함께 실행됩니다. 화면은 `exhibition/frontend-example/index.html`에 있으며 이 파일을 교체하거나 `--frontend-url`로 다른 작품 서버를 지정합니다. 관리자 링크도 시작 후 기본 브라우저에서 자동으로 열립니다. **[두 커서 확인 화면](http://localhost:8080/stage)**은 하늘색 1P, 주황색 2P가 하나의 화면을 사용하는 연결 확인용 페이지입니다. 최종 작품을 대신하지 않습니다. 예시 작품에서는 라이브 눈 영상과 보정 전 임시 커서를 확인하고 1P·2P 순서로 보정합니다. 같은 화면에서 착용 확인 → 방향 모델 준비 → 정면 안내 → 9점 보정 → 별도의 3점 검증 → 부드러운 시선 커서로 이어집니다. 기존 8080/8081 보정 화면도 유지합니다.

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

설정 파일은 자동 생성되고 Git에서 제외됩니다. 이전 단일 사용자 설정은 사용자 1에서 그대로 사용합니다. Mac 방화벽에서 Python의 수신을 허용하고 두 포트가 모두 접근 가능한지 확인하세요. Ctrl+C로 두 서버를 함께 종료합니다. Pi는 부팅 자동실행하며, 현재 전시 Mac은 로그인 자동실행도 설치되어 있습니다. 위 명령은 자동 서비스를 중지한 뒤 수동 개발에 사용합니다.

장비 없이 두 운영 화면을 시험하려면:

```bash
bash start-mac.sh --two-users --simulate
```

예시 작품의 착용 완료를 누르고 마우스로 보정 점을 따라갑니다. 시뮬레이션은 실제 카메라 정확도 검증이 아닙니다.

## 3. 각 Pi를 올바른 사용자에 연결

1. Mac의 `http://localhost:8080`에서 사용자 1 연결 토큰을 복사합니다.
2. `http://eye-pi-1.local:8000`에서 **8080 수신 주소와 사용자 1 토큰**을 저장합니다.
3. Mac의 `http://localhost:8081`에서 사용자 2 연결 토큰을 복사합니다.
4. `http://eye-pi-2.local:8000`에서 **8081 수신 주소와 사용자 2 토큰**을 저장합니다.
5. 각 Pi에서 “카메라 정상 / Mac 연결됨”, 각 Mac 운영 화면에서 해당 눈 영상을 확인합니다.

Pi에 저장하는 Mac 주소는 Pi에서 접근 가능한 Wi-Fi IP나 hostname입니다. `localhost`를 쓰면 안 됩니다. 가능하면 공유기에서 Mac의 DHCP 주소를 예약하세요. 토큰이나 포트를 뒤바꾸면 연결되지 않습니다. Pi 설정 UI는 카메라 번호, 해상도, FPS, 압축 품질, 회전, 수신 주소와 토큰을 저장합니다. OS Wi-Fi 설정은 포함하지 않습니다.

## 4. 두 관람객 보정·교체

[예시 작품](http://localhost:5173)의 **착용 확인 · 보정 시작**을 1P, 2P 순서로 누릅니다. 전체 화면 진입 후 착용 확인 → 방향 모델 준비 → 정면 안내 → 9점 보정 → 3점 검증을 같은 화면에서 진행합니다. Pupil 엔진은 정면 기준도 자동 수집합니다. 지정 좌석이어도 관람객마다 보정합니다. 기존 8080/8081 운영 화면은 9점 보정과 중앙 검증을 제공합니다.

- 한 화면을 함께 쓰면 사용자 1, 사용자 2 순서로 보정하세요. 같은 브라우저 창의 두 탭을 사용하고, 브라우저 자체를 전체 화면으로 만든 뒤 두 보정 탭과 작품 탭을 같은 크기로 유지합니다. 각 페이지의 “전체 화면” 버튼은 별도 화면에서 사용할 때 사용하세요. 두 사람 모두 최종 작품과 같은 화면 크기·위치·자세에서 보정합니다.
- 관람객이 1번 자리만 바뀌면 작품의 **1P 보정 시작**으로 재보정합니다. 2번도 해당 카드에서 처리합니다. 다른 관람객의 보정은 유지됩니다.
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

전시 코드, 알고리즘, 예전 실험을 폴더별로 정리했습니다. [기존 학생 MJPEG/Windows 데모](legacy/docs/LEGACY_PI_DEMO.md)는 새 WebSocket 운영 경로와 별개입니다. **실제 Pi 두 대와 전시장 Wi-Fi에서 동시 FPS, 지연, 보정 정확도, 재부팅을 검증해야 합니다.** 기본 요청은 각 Pi 320×240 / 20 FPS입니다. Pi는 카메라 MJPEG 직송을 우선 시도해 계산량을 줄이고, 미지원 시 JPEG 품질 65로 인코딩합니다. 24 FPS 목표 운용은 카메라가 지원하는 30 FPS 모드를 확인한 뒤 Pi 최대 FPS를 30으로 설정하고 실제 캡처·출력·Mac 수신 FPS를 비교하세요. [근접 추적·착용 보정·24 FPS 개발안](exhibition/docs/TRACKING_DESIGN_KO.md)에 조사 결과와 구현 상태를 정리했습니다.

단일 사용자 개발은 명시적으로 `--single-user`를 사용합니다.

```bash
bash start-mac.sh --single-user
bash start-mac.sh --single-user --simulate
```

원본 프로젝트 소개와 크레딧은 [원본 안내](legacy/docs/UPSTREAM.md)에 보존했습니다.

## Compute server 시작과 작품 교체

```bash
cd ~/Documents/GitHub/EyeTracker-pi
bash start-mac.sh
```

기본 시작은 1P·2P 처리 서버와 별도 예시 작품 서버를 켭니다. 준비가 완료되면 Pi별 LAN 수신 주소, 통합 관리자, 작품 URL과 두 시선 구독 주소를 한 번에 출력합니다. 관리자 기본 브라우저 자동 열기를 끄려면 `--no-open`, 가상 입력은 `--simulate`를 추가합니다. `--two-users`도 기존 명령과 호환됩니다. Ctrl+C는 두 처리 서버와 내장 예시 작품 서버를 함께 종료합니다.

예시 작품 주소는 `http://localhost:5173`입니다. 화면 파일 `exhibition/frontend-example/index.html`을 바꾸면 다른 처리 코드를 수정할 필요가 없습니다. 별도 프론트엔드 개발 서버로 교체하려면 `bash start-mac.sh --frontend-url http://localhost:5173`을 사용합니다. 이때 내장 예시는 실행하지 않고 해당 주소를 안내합니다. 별도 작품 서버는 작품 담당자가 실행합니다. 지정 주소는 로컬 `exhibition/server-config.json`에 저장됩니다. 내장 예시로 복귀할 때는 `bash start-mac.sh --frontend-url ''`를 사용합니다.

## 토큰·Mac 주소·Pi 업데이트

Pi가 Mac에 영상을 보낼 때 사용하는 이름은 **Pi 영상 전송 토큰**으로 통일합니다. 작품 프론트엔드가 좌표를 받을 때는 별도의 **작품 시선 구독 토큰**을 사용합니다. Mac 토큰은 최초 생성 후 사용자별 `exhibition/mac-config.json`, `exhibition/mac-user2-config.json`에 저장되므로 Mac/Pi 재부팅, 서버 재시작, 새 관람객 보정이나 일반 코드 업데이트로 바뀌지 않습니다. 해당 Mac 설정을 삭제하거나 다른 설정 파일로 새 서버를 만들면 토큰이 새로 생성됩니다. Pi에 저장한 토큰도 `exhibition/pi-config.json`에 유지됩니다. 보정 상태는 토큰과 달리 서버 재시작·Pi 재연결 후 초기화됩니다.

관리자 카드의 **Pi에 입력할 영상 수신 주소**가 실제 Mac LAN IP를 자동 감지해 표시하며 복사 버튼이 있습니다. 페이지는 30초마다 주소를 다시 확인합니다. `0.0.0.0`은 서버가 모든 인터페이스에서 연결을 받는 바인딩 주소로, Pi에 입력할 Mac 주소가 아닙니다. LAN IP는 공유기나 네트워크가 바뀌면 달라질 수 있으므로 관리자에 표시된 주소를 다시 저장하세요. DHCP 예약을 사용하면 주소를 유지하기 쉽습니다. 자동 감지가 실패하면 Mac의 네트워크 설정에서 실제 IP를 확인합니다.

Pi 업데이트는 SSH로 Pi에 접속한 상태에서 최초 설치와 같은 명령을 다시 실행할 수 있습니다. 최신 GitHub main으로 fast-forward 업데이트하고 필요한 의존성 설치와 서비스를 재시작합니다. 저장된 토큰과 UI 비밀번호 등 로컬 설정은 유지합니다. 수정 중인 코드가 있거나 main이 아닌 경우에는 덮어쓰지 않고 중단합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/chanulee/EyeTracker-pi/main/install.sh -o /tmp/eye-install.sh && bash /tmp/eye-install.sh
```

`update-pi.sh: No such file or directory`는 Pi checkout에 스크립트가 아직 없다는 뜻입니다. 위 다운로드 명령으로 먼저 업데이트하세요. 이번 변경을 GitHub main에 올려 설치한 이후에는 아래 전용 업데이트 진입점도 같은 작업을 합니다.

```bash
cd ~/EyeTracker-pi
bash exhibition/scripts/update-pi.sh
```

자동실행 Mac은 저장소를 업데이트한 뒤 `bash setup-autostart-mac.sh install`로 실행본을 갱신합니다. 수동 개발 서버는 Ctrl+C로 종료하고 해당 엔진으로 다시 시작합니다. 전시 운용 중 업데이트하면 연결과 보정이 초기화되므로 새로 보정합니다.

## 전원 켜기와 자동 복구

현재 전시 Mac에는 로그인 자동실행을 설치했습니다. Mac 로그인 후 Pupil 3D 1P·2P 서버와 작품 페이지가 시작되고, Pi는 부팅 시 저장된 주소·토큰으로 자동 송출합니다. Mac은 로그인 자체를 자동화하지 않습니다. 관람객마다 시선 보정은 필요합니다.

```bash
bash setup-autostart-mac.sh status
# Mac 코드 업데이트 후 실행본 갱신
bash setup-autostart-mac.sh install
```

자동실행 프로그램은 `~/Library/Application Support/EyeTracker-pi/app`, 실제 운영 설정은 `state/`에 유지합니다. 최초 설치 때 기존 설정을 복사하며 재설치 시 운영 설정을 덮어쓰지 않습니다. 저장소 수정 후 위 install 명령으로 반영하세요. 중지/시작/재시작/해제는 같은 스크립트의 `stop/start/restart/remove`를 사용합니다.

Pi의 카메라 선택은 USB 자동 검색이 기본입니다. 영상 캡처 노드만 선택하고 metadata/내부 코덱 노드는 제외합니다. FPS·품질 변경은 USB 장치를 닫지 않습니다. 카메라가 끊기면 장치를 해제하고 2초마다 재검색하며, 드라이버가 멈추면 systemd watchdog이 송신기를 재시작합니다. 이번 Pi 변경은 GitHub main에 올린 뒤 Pi 설치/업데이트 스크립트를 실행해야 적용됩니다. USB 컨트롤러나 전원 문제로 장치 자체가 반환되지 않으면 소프트웨어 재시도만으로 복구하지 못할 수 있습니다. [자동실행·USB 복구 안내](exhibition/docs/AUTOSTART_KO.md)를 참고하세요.
