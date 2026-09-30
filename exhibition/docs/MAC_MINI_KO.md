# 현재 전시용 Mac mini

## 설치 확인 기록 — 2026-09-30

이 저장소의 `.venv/`에 Python 3.12.14, aiohttp 3.14.3, NumPy 2.5.3, OpenCV 4.14.0이 설치되었습니다. Python은 이 Mac의 Codex 제공 런타임을 기반으로 하며 시스템 Python을 변경하지 않았습니다. 기반 런타임이 제거되거나 저장소를 다른 컴퓨터로 복사하면 Python 3.10 이상의 환경으로 `.venv`를 다시 만들어야 합니다.

Mac 서버 소프트웨어와 관리자 UI의 실행 준비는 완료했습니다. 실제 Pi 두 대의 설치·네트워크 연결·카메라 영상·현장 정확도 검증은 이 기록에 포함하지 않습니다. 현재 로그인 자동실행도 설치했습니다. 실행 중 `caffeinate`로 화면·시스템의 유휴 잠자기를 억제합니다. 라이브러리 설치 완료와 전시 전체 셋업 완료는 구분합니다.

## 시작과 종료

현재 설치된 자동실행의 실제 설정은 `~/Library/Application Support/EyeTracker-pi/state/`에 있습니다. 최초 설치 때 저장소의 토큰·Origin·작품 주소를 복사했고 이후 재설치 시 운영 중 설정을 유지합니다. 프로그램은 같은 위치의 `app/`, 로그는 `app/exhibition/.runtime/`에 있습니다. macOS 로그인 서비스가 Documents 저장소를 읽지 못해 Application Support에 실행본을 설치했습니다. 저장소를 수정해도 실행본이 즉시 바뀌지 않으므로 `bash setup-autostart-mac.sh install`로 갱신하세요.

아래는 수동 개발 실행입니다. 자동 서비스를 먼저 `bash setup-autostart-mac.sh stop`으로 중지해야 합니다.

Mac 터미널에서 실행합니다.

```bash
cd /Users/design01/Documents/GitHub/EyeTracker-pi
bash start-mac.sh --two-users
```

터미널을 유지하고 [통합 관리자](http://localhost:8080/admin)를 엽니다. 8080은 1P, 8081은 2P입니다. Pi를 아직 연결하지 않았다면 연결 대기로 표시됩니다. 관리자에서 각 Pi 영상 전송 토큰, 작품 시선 구독 토큰, Origin 설정과 연결 상태를 확인합니다. 보정은 각 사용자 운영 화면에서 순서대로 진행합니다.

실제 카메라 없이 UI를 시험할 때는 서버를 Ctrl+C로 종료한 뒤 다음 명령으로 시작합니다.

```bash
bash start-mac.sh --two-users --simulate
```

시뮬레이션의 각 보정 화면에서 마우스로 점을 따라갑니다. 시뮬레이션에서는 실제 Pi 연결을 받지 않습니다. [두 커서 확인 화면](http://localhost:8080/stage)은 각 사용자의 보정이 완료되면 같은 화면 전체에 두 좌표를 표시합니다. 실제 전시로 돌아갈 때 Ctrl+C로 종료하고 `--simulate` 없이 시작합니다.

이 Mac은 재부팅 후 사용자 로그인 시 Pupil 3D 서버 두 개와 작품 페이지가 자동으로 시작됩니다. 로그인 전에는 시작하지 않으며 자동 로그인·FileVault 설정은 바꾸지 않습니다. 서버가 이미 켜져 있으면 수동 시작 명령을 중복 실행하지 마세요. 자동실행은 `bash setup-autostart-mac.sh status/start/stop/restart/install/remove`로 관리합니다. `stop`은 이번 로그인 세션에서만 중지하고 `remove`는 다음 로그인 자동실행도 해제합니다. Pi는 systemd로 부팅 자동 실행됩니다. [자동실행·복구 상세](AUTOSTART_KO.md)를 참고하세요.

## 다음 현장 준비

Mac과 Pi를 서로 통신할 수 있는 같은 LAN에 연결합니다. Pi Zero 2 W의 Wi-Fi는 2.4 GHz를 사용합니다. Mac의 LAN 주소를 예약하고 두 Pi 설정에 각각 `ws://Mac의LAN주소:8080/camera`, `ws://Mac의LAN주소:8081/camera`와 해당 사용자 Pi 토큰을 저장합니다. Mac 방화벽 수신 허용과 실제 눈 영상을 확인한 뒤 관람객마다 보정합니다. 작품 Origin과 시선 구독 토큰을 별도 프론트엔드에 연결합니다. 자세한 순서는 [운영 매뉴얼](SETUP_KO.md)에 있습니다.

## 3단계 시작 안내와 예시 작품

`bash start-mac.sh`는 1P·2P compute worker와 `http://localhost:5173` 예시 작품 서버를 함께 시작합니다. 터미널에는 Pi SW → Mac mini compute server → 작품 프론트엔드 구조, 각 Pi의 실제 LAN 수신 주소와 연결 상태, 통합 관리자 URL, 작품 URL과 구독 주소가 표시됩니다. OpenGL은 전시의 GUI 없는 추론 경로에서 불러오지 않습니다. 준비가 끝나면 기본 브라우저로 관리자를 엽니다. 자동 열기를 끄려면 `--no-open`을 추가합니다.

전시 작품은 `exhibition/frontend-example/`의 Next.js 서버이며 `http://localhost:5173`에서 실행합니다. Mac 연결 코드는 `exhibition/frontend-integration/`에서 관리합니다. 작품 서버의 HTTP/WebSocket 연결 지점과 `EntryFlowContext.jsx`의 엔진 연결만 유지하면 작품 화면은 별도로 수정할 수 있습니다. 같은 작품 주소의 `/gaze?user_id=1`과 `/gaze?user_id=2`가 각 Mac worker를 중계합니다. 영상·보정 API는 localhost bridge(5174)를 통해 연결하고, 시선 구독 토큰은 서버 안에서 처리합니다. [연결·업데이트 안내](../frontend-integration/README.md)를 참고하세요.

## 토큰·Mac 주소·Pi 업데이트

Pi가 Mac에 영상을 보낼 때 사용하는 이름은 **Pi 영상 전송 토큰**으로 통일합니다. 작품 프론트엔드가 좌표를 받을 때는 별도의 **작품 시선 구독 토큰**을 사용합니다. Mac 토큰은 최초 생성 후 사용자별 `exhibition/mac-config.json`, `exhibition/mac-user2-config.json`에 저장되므로 Mac/Pi 재부팅, 서버 재시작, 새 관람객 보정이나 일반 코드 업데이트로 바뀌지 않습니다. 해당 Mac 설정을 삭제하거나 다른 설정 파일로 새 서버를 만들면 토큰이 새로 생성됩니다. Pi에 저장한 토큰도 `exhibition/pi-config.json`에 유지됩니다. 보정 상태는 토큰과 달리 서버 재시작·Pi 재연결 후 초기화됩니다.

관리자 카드의 **Pi에 입력할 영상 수신 주소**가 실제 Mac LAN IP를 자동 감지해 표시하며 복사 버튼이 있습니다. 페이지는 30초마다 주소를 다시 확인합니다. `0.0.0.0`은 서버가 모든 인터페이스에서 연결을 받는 바인딩 주소로, Pi에 입력할 Mac 주소가 아닙니다. LAN IP는 공유기나 네트워크가 바뀌면 달라질 수 있으므로 관리자에 표시된 주소를 다시 저장하세요. DHCP 예약을 사용하면 주소를 유지하기 쉽습니다. 자동 감지가 실패하면 Mac의 네트워크 설정에서 실제 IP를 확인합니다.

Pi 업데이트는 SSH로 Pi에 접속한 상태에서 최초 설치와 같은 명령을 다시 실행할 수 있습니다. 최신 GitHub main으로 fast-forward 업데이트하고 필요한 의존성 설치와 서비스를 재시작합니다. 저장된 토큰과 UI 비밀번호 등 로컬 설정은 유지합니다. 수정 중인 코드가 있거나 main이 아닌 경우에는 덮어쓰지 않고 중단합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/chanulee/EyeTracker-pi/main/install.sh -o /tmp/eye-install.sh && bash /tmp/eye-install.sh
```

이번 변경을 GitHub에 올려 설치한 이후에는 아래 전용 업데이트 진입점도 같은 작업을 합니다.

```bash
cd ~/EyeTracker-pi
bash exhibition/scripts/update-pi.sh
```

자동실행 Mac은 저장소를 업데이트한 뒤 `bash setup-autostart-mac.sh install`로 실행본을 갱신합니다. 수동 개발은 서버를 Ctrl+C로 종료하고 해당 엔진으로 다시 시작합니다. 전시 운용 중 업데이트하면 연결과 보정이 초기화되므로 새로 보정합니다.
