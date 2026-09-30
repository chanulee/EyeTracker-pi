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

터미널을 유지하고 [통합 관리자](http://localhost:8080/admin)를 엽니다. 8080은 1P, 8081은 2P입니다. Pi를 아직 연결하지 않았다면 연결 대기로 표시됩니다. 관리자에서 각 Pi 영상 전송 토큰, 작품 시선 구독 토큰, Origin 설정과 연결 상태를 확인합니다. 보정은 각 사용자 운영 화면에서 순서대로 진행합니다.

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

Mac 코드는 해당 Mac 저장소를 업데이트한 후 compute server를 Ctrl+C로 종료하고 `bash start-mac.sh`로 다시 시작합니다. 전시 운용 중 업데이트하면 연결과 보정이 초기화되므로 새로 보정합니다.
