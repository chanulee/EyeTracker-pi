# 현재 전시용 Mac mini

## 설치 확인 기록 — 2026-09-30

이 저장소의 `.venv/`에 Python 3.12.14, aiohttp 3.14.3, NumPy 2.5.3, OpenCV 4.14.0이 설치되었습니다. Python은 이 Mac의 Codex 제공 런타임을 기반으로 하며 시스템 Python을 변경하지 않았습니다. 기반 런타임이 제거되거나 저장소를 다른 컴퓨터로 복사하면 Python 3.10 이상의 환경으로 `.venv`를 다시 만들어야 합니다.

Mac 서버 소프트웨어와 관리자 UI의 실행 준비는 완료했습니다. 실제 Pi 두 대의 설치·네트워크 연결·카메라 영상·현장 정확도 검증은 이 기록에 포함하지 않습니다. 로그인 시 자동 실행과 macOS 절전 설정도 구성하지 않았습니다. 라이브러리 설치 완료와 전시 전체 셋업 완료는 구분합니다.

## 시작과 종료

Mac 터미널에서 실행합니다.

```bash
cd /Users/design01/Documents/GitHub/EyeTracker-pi
bash start-mac.sh --two-users
```

터미널을 유지하고 [통합 관리자](http://localhost:8080/admin)를 엽니다. 8080은 1P, 8081은 2P입니다. Pi를 아직 연결하지 않았다면 연결 대기로 표시됩니다. 관리자에서 각 Pi 전송 토큰, 작품 구독 토큰, Origin 설정과 연결 상태를 확인합니다. 보정은 각 사용자 운영 화면에서 순서대로 진행합니다.

실제 카메라 없이 UI를 시험할 때는 서버를 Ctrl+C로 종료한 뒤 다음 명령으로 시작합니다.

```bash
bash start-mac.sh --two-users --simulate
```

시뮬레이션의 각 보정 화면에서 마우스로 점을 따라갑니다. 시뮬레이션에서는 실제 Pi 연결을 받지 않습니다. [두 커서 확인 화면](http://localhost:8080/stage)은 각 사용자의 보정이 완료되면 같은 화면 전체에 두 좌표를 표시합니다. 실제 전시로 돌아갈 때 Ctrl+C로 종료하고 `--simulate` 없이 시작합니다.

Mac 서버는 부팅할 때 자동으로 켜지지 않습니다. 전시 시작 때 위 명령을 실행합니다. 종료는 서버 터미널에서 Ctrl+C입니다. 전시 중 잠자기에 들어가지 않도록 Mac 설정을 확인하세요. Pi는 별도의 설치 스크립트를 실행하면 systemd로 부팅 자동 실행됩니다.

## 다음 현장 준비

Mac과 Pi를 서로 통신할 수 있는 같은 LAN에 연결합니다. Pi Zero 2 W의 Wi-Fi는 2.4 GHz를 사용합니다. Mac의 LAN 주소를 예약하고 두 Pi 설정에 각각 `ws://Mac의LAN주소:8080/camera`, `ws://Mac의LAN주소:8081/camera`와 해당 사용자 Pi 토큰을 저장합니다. Mac 방화벽 수신 허용과 실제 눈 영상을 확인한 뒤 관람객마다 보정합니다. 작품 Origin과 시선 구독 토큰을 별도 프론트엔드에 연결합니다. 자세한 순서는 [운영 매뉴얼](SETUP_KO.md)에 있습니다.

## 3단계 시작 안내와 예시 작품

`bash start-mac.sh`는 1P·2P compute worker와 `http://localhost:5173` 예시 작품 서버를 함께 시작합니다. 터미널에는 Pi SW → Mac mini compute server → 작품 프론트엔드 구조, 각 Pi의 실제 LAN 수신 주소와 연결 상태, 통합 관리자 URL, 작품 URL과 구독 주소가 표시됩니다. OpenGL은 전시의 GUI 없는 추론 경로에서 불러오지 않습니다. 준비가 끝나면 기본 브라우저로 관리자를 엽니다. 자동 열기를 끄려면 `--no-open`을 추가합니다.

예시 작품은 `exhibition/frontend-example/index.html`만 교체하면 됩니다. 다른 작품 서버를 사용하려면 compute server를 Ctrl+C로 종료하고 `bash start-mac.sh --frontend-url http://localhost:5173`처럼 실행합니다. 이때 내장 예시는 시작하지 않으므로 작품 개발 서버를 별도로 실행하세요. 지정 주소는 `exhibition/server-config.json`에 저장됩니다. `--frontend-url ''`는 내장 예시로 복귀합니다. 내장 예시 Origin은 자동 등록하며 외부 작품 Origin은 두 사용자 관리자 카드에 등록하세요. 단일 사용자 개발은 `bash start-mac.sh --single-user`입니다.
