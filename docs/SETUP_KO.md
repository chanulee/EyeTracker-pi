# Pi Zero 2 W → Mac mini 운영 매뉴얼

구성: GC0308 **USB/UVC 눈 카메라** → Pi Zero 2 W (JPEG 인코딩) → 같은 Wi-Fi의 Mac mini (WebSocket 수신, 기존 Orlosky 동공/3D 방향 추정, 안정화, 개인별 화면 보정) → 웹 프론트엔드.

전시에서는 Pi 두 대·관람객 두 명을 사용합니다. Mac에서 `bash scripts/start-mac.sh --two-users`로 사용자별 서버를 실행하세요. 사용자 1은 8080, 사용자 2는 8081이며 눈 모델과 보정값은 분리됩니다. 두 Pi의 hostname/토큰/수신 주소 연결표는 [README의 두 사용자 설치 절차](../README.md)를 먼저 확인하세요. 아래 단일 세트 설치·보정 절차를 각 사용자에게 적용합니다. 2번 사용자는 아래 8080 예시를 8081로, Pi hostname을 eye-pi-2로 바꾸고 해당 사용자 2 토큰을 사용하세요. `direction`은 카메라/기존 트래커 모델 기준의 추정 방향입니다. 정확한 물리적 각도나 방 안의 좌표를 측정하지 않습니다. 화면에서 사용할 값은 개인별 보정이 끝난 `x/y`입니다. 지정 좌석이어도 눈·장착 위치가 달라지므로 관람객마다 다시 보정합니다. 머리 이동 보정은 포함하지 않으므로 카메라는 눈에 대해 고정하고 자세를 유지하세요. 멀리서 얼굴 전체를 촬영하는 구성은 이 근접 눈 트래커의 입력 조건과 다릅니다.

## 1. 최초 Pi 준비 (화면·브라우저 불필요)

1. Raspberry Pi Imager로 Raspberry Pi OS Lite를 설치합니다. 기기를 Zero 2 W로 선택하고 hostname은 사용자별 `eye-pi-1` 또는 `eye-pi-2`, 사용자/비밀번호, **2.4 GHz Wi-Fi**, 지역 설정, SSH 활성화를 미리 설정하세요. Mac도 같은 네트워크에 연결합니다. 아래 `eye-pi` 예시는 실제 지정한 `eye-pi-1` 또는 `eye-pi-2`로 바꿔 실행하세요. [공식 설치 안내](https://www.raspberrypi.com/documentation/computers/getting-started.html).
2. USB 카메라를 Zero의 **USB 데이터 포트**에 OTG 어댑터로 연결합니다. 전원 포트와 구분하세요. GC0308이라는 센서 이름만으로 Linux 지원을 확정할 수 없습니다. 아래 명령에서 UVC/V4L2 장치로 잡히는 실제 제품이어야 합니다.
3. Mac 터미널에서 접속합니다. `<사용자>`는 Imager에서 만든 사용자 이름입니다.

```bash
ssh <사용자>@eye-pi.local
```

4. **접속한 Pi 터미널**에서 아래 한 줄을 실행합니다. GitHub 다운로드 → `~/EyeTracker-pi` 설치 → 패키지 설치 → 부팅 자동실행 등록까지 처리합니다. `sudo bash`로 실행하지 마세요. 설치 중 sudo 비밀번호를 요청할 수 있습니다.

```bash
curl -fsSL https://raw.githubusercontent.com/chanulee/EyeTracker-pi/main/install.sh -o /tmp/eye-install.sh && bash /tmp/eye-install.sh
```

**이 명령은 이번 변경사항이 GitHub `chanulee/EyeTracker-pi`의 `main`에 올라간 뒤 사용할 수 있습니다.** 현재 로컬 파일만 수정된 상태라면 먼저 커밋/push해야 합니다. 로그인 없는 위 명령은 공개 저장소 기준입니다. 비공개 저장소는 GitHub 인증을 별도로 구성해야 합니다.

루트 `install.sh`는 Git이 없으면 설치하고 main 브랜치를 내려받은 뒤 기존 `scripts/install-pi.sh`를 실행합니다. 이미 같은 저장소가 설치되어 있고 변경사항이 없으면 최신 main으로 fast-forward 업데이트합니다. 설정 파일은 Git에서 제외되어 유지됩니다. 다른 파일이 들어 있는 폴더나 수정 중인 저장소는 덮어쓰지 않고 중단합니다. 기본 경로 대신 다른 경로를 쓰려면 `bash /tmp/eye-install.sh /원하는/설치경로`로 실행합니다.

GitHub에 올리기 전 로컬 수정본을 바로 설치해야 한다면, Mac의 저장소 루트에서 아래 복사 방법도 사용할 수 있습니다.

```bash
ssh <사용자>@eye-pi.local 'mkdir -p ~/EyeTracker-pi'
COPYFILE_DISABLE=1 tar --exclude=.git --exclude=.venv --exclude=.venv-pi \
  --exclude=__pycache__ --exclude='*-config.json' --exclude=assets/eye_test.mp4 -czf - . \
  | ssh <사용자>@eye-pi.local 'tar -xzf - -C ~/EyeTracker-pi'
ssh -t <사용자>@eye-pi.local 'cd ~/EyeTracker-pi && bash scripts/install-pi.sh'
```

설치 스크립트가 Python/OpenCV/NumPy/aiohttp를 OS 패키지로 설치하고 `eye-pi.service`를 등록합니다. 일반 SSH 사용자로 실행하세요. 출력된 **Pi UI 사용자 `admin` / 비밀번호**를 기록합니다. 재부팅 후 자동실행하며 카메라나 Mac이 늦게 켜져도 재시도합니다. 설치를 다시 실행해도 저장된 설정은 유지합니다.

```bash
ssh <사용자>@eye-pi.local
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video0 --list-formats-ext
```

`/dev/video0`이 영상 캡처 장치인지 확인합니다. 목록의 다른 번호이면 Pi UI에서 변경합니다. 장치가 없으면 케이블/OTG/전원/카메라 드라이버부터 확인합니다. Pi 브라우저는 필요 없습니다.

### SSH/Wi-Fi를 설정하지 않고 이미 flash한 경우

모니터/키보드가 없는 새 Pi라면 Mac의 Raspberry Pi Imager에서 OS를 다시 기록하면서 Customisation을 설정하는 방법이 가장 간단합니다. 다시 기록하면 SD 카드의 기존 내용은 지워집니다. 이미 사용자 계정과 네트워크가 설정되어 있고 Pi 터미널에 접근할 수 있다면 `sudo raspi-config`의 Interface Options → SSH에서 SSH를 켜면 됩니다.

Imager에서 아래 항목을 설정합니다. 화면 이름은 Imager 버전에 따라 약간 다를 수 있습니다.

| 항목 | 입력 |
|---|---|
| Device / OS | Raspberry Pi Zero 2 W / Raspberry Pi OS Lite |
| Hostname | `eye-pi` |
| User | 원하는 사용자 이름과 비밀번호 (예: `eye`) |
| Localisation | Seoul / Asia-Seoul, Wi-Fi 국가 KR |
| Wi-Fi | Pi를 사용할 네트워크의 SSID와 비밀번호 |
| Remote Access | Enable SSH, Use password authentication |

[공식 Imager 설정 안내](https://www.raspberrypi.com/documentation/computers/getting-started.html#customise). 기록 후 SD 카드를 Pi에 넣고 전원을 연결한 뒤 첫 부팅을 기다립니다. 사용자 이름이 `eye`라면 Mac에서 `ssh eye@eye-pi.local`로 접속하고, Imager에서 지정한 비밀번호를 입력합니다. 비밀번호 입력 시 터미널에는 글자가 나타나지 않습니다. `.local`이 안 되면 공유기의 장치 목록에서 Pi IP를 확인하여 `ssh eye@Pi의IP`를 사용합니다.

### Wi-Fi를 고르는 기준

집/작업실/전시장 공유기 또는 2.4 GHz를 제공하는 핫스팟 등에서 Mac과 Pi가 서로 통신할 수 있으면 됩니다. Zero 2 W는 **2.4 GHz만 지원**합니다. Mac은 같은 공유기의 5 GHz나 유선 LAN에 연결되어 있어도 Pi와 같은 LAN으로 이어져 있으면 가능합니다. [공식 무선 사양](https://www.raspberrypi.com/documentation/computers/getting-started.html#networking).

같은 Wi-Fi 이름만으로 통신을 보장하지는 않습니다. 게스트 Wi-Fi의 기기 간 통신 차단, AP/client isolation, 학교/전시장 네트워크의 VLAN 분리나 방화벽이 있으면 SSH와 영상 전송이 막힐 수 있습니다. 최종 확인은 Mac에서 Pi로 SSH 접속되고, Pi UI에서 Mac 연결 상태가 정상인지입니다. 설치 중에는 인터넷이 필요하고, 설치 후 영상·좌표 처리는 로컬 네트워크만으로 동작합니다.

다른 장소로 옮겼을 때 Pi가 Wi-Fi를 자동으로 발견하고 비밀번호를 알아내지는 않습니다. 새 네트워크 연결 설정과 Mac 수신 주소를 다시 확인해야 합니다. 이 프로젝트의 Pi UI는 카메라/영상 수신 설정을 담당하며 OS Wi-Fi 설정은 포함하지 않습니다.

## 2. Mac 시작

Python 3.10 이상과 이 저장소가 필요합니다. Python이 없다면 [Python 공식 배포](https://www.python.org/downloads/macos/)를 설치하세요.

```bash
bash scripts/start-mac.sh
```

첫 실행은 `.venv`에 라이브러리를 설치합니다. 전시용 두 사용자 시작은 `bash scripts/start-mac.sh --two-users`입니다. Mac 운영 화면은 **http://localhost:8080** (1번), **http://localhost:8081** (2번)입니다. Mac에서 터미널을 켜 둡니다. 서버는 Pi를 받기 위해 `0.0.0.0:8080`에 바인딩하지만 설정·보정·카메라 미리보기는 Mac의 localhost에서만 허용합니다. macOS 방화벽에서 해당 Python의 로컬 네트워크 수신을 허용하세요.

하드웨어 없이 화면/연결/보정 동작을 시험할 때:

```bash
bash scripts/start-mac.sh --simulate
```

마우스를 빨간 점으로 이동시켜 보정합니다. 이는 테스트 입력이고 실제 카메라 정확도를 검증하지 않습니다. 일반 서버와 동시에 같은 포트에서 실행하지 마세요.

## 3. Pi 연결 설정

1. Mac에서 **http://eye-pi.local:8000**을 엽니다. 설치 시 출력된 admin 비밀번호로 로그인합니다. `.local`이 안 되면 공유기의 Pi IP를 사용하세요.
2. Mac 운영 화면의 “Mac 설정 / 프론트엔드 연결”에서 Pi 연결 토큰을 복사합니다.
3. Pi UI에서 `ws://Mac의WiFiIP:8080/camera`를 입력하고 토큰을 붙여넣어 저장합니다. 주소는 Pi에서 접근 가능한 Mac 주소여야 합니다. `localhost`는 사용할 수 없습니다. Mac IP는 시스템 설정 → Wi-Fi → 세부사항 → TCP/IP에서 확인하세요. DHCP 예약을 설정하면 재부팅마다 주소를 바꾸는 일을 줄일 수 있습니다. `mac-mini.local` 같은 hostname도 네트워크에서 해석되면 가능합니다.
4. 기본값 320×240, 20 FPS, 품질 65로 시작합니다. Pi UI 상태에서 “카메라 정상”, “Mac 연결됨”을 확인하고 Mac에서 영상 미리보기를 확인합니다.
5. 영상 장착 방향이 거꾸로면 Pi UI의 180° 회전을 사용합니다. Mac의 회전 설정과 동시에 켜면 다시 원래 방향이 됩니다. 영상 크기/회전/카메라 장착을 바꾼 뒤 “새 관람객”부터 다시 보정하세요.

Pi UI는 카메라 번호·크기·FPS·압축 품질·회전·Mac 수신 주소·토큰을 저장하고 즉시 재연결합니다. 웹 학생의 사이트 Origin과 Mac의 필터 설정은 Mac UI에서 설정합니다. Pi는 프론트엔드에 직접 좌표를 보내지 않습니다.

## 4. 관람객 교체와 보정

1. 카메라가 전체 눈을 충분히 크게 보여주게 고정합니다. 검은 테두리/속눈썹/반사광이 동공보다 크게 보이지 않게 하고 일정한 조명을 유지합니다.
2. **새 관람객**을 누릅니다. 이전 화면 보정과 눈 모델이 폐기됩니다.
3. 관람객에게 눈을 여러 방향으로 천천히 움직이게 합니다. 기존 트래커가 서로 다른 동공 타원으로 눈 중심을 추정합니다. 충분한 눈 모델 데이터와 유효 검출이 모이면 “개인별 보정” 버튼이 활성화됩니다. 버튼이 안 켜지면 영상/장착/조명부터 확인합니다.
4. 전체 화면을 먼저 켭니다. 개인별 보정을 시작하면 눈 모델을 고정하고 9개 지점을 차례로 보여줍니다. 각 점은 0.9초 준비 + 1.2초 수집입니다. 점을 따라 머리를 움직이지 마세요.
5. 유효 프레임이 12개 미만이거나 흔들림이 크면 해당 점에서 정지하고 다시 수집할 수 있습니다. “보정 취소”나 Esc로 처음부터 다시 할 수도 있습니다.
6. 마지막 중앙 점을 다시 봅니다. 중앙 검증 오차가 화면 정규 좌표 거리 0.12보다 크면 보정이 활성화되지 않습니다. 통과해도 모든 위치의 정확도를 보장하지 않으므로 네 모서리와 실제 상호작용 영역을 직접 확인하세요.
7. 타일을 1초 바라보면 선택합니다. 프론트엔드에서는 같은 `x/y`를 원하는 인터랙션에 연결합니다.

화면 크기·전체 화면 상태가 바뀌면 프로토타입은 보정을 폐기합니다. 실제 프론트엔드도 같은 화면 크기/비율과 좌석에서 동작하도록 구성하세요. 보정 모델은 메모리에만 유지되고 서버 재시작·Pi 재연결·새 관람객마다 초기화됩니다. 이름이나 얼굴 영상은 저장하지 않습니다.

## 5. 시스템 안정화 조절

- 품질 기준: 기본 0.65. 기존 동공 검출의 마스크 비율이며 통계적 확률은 아닙니다. 낮추면 오검출이 늘 수 있습니다.
- 안정화 시간: 기본 80ms. 최근 3개 화면 좌표의 중앙값 + 시간 기반 지수 평활입니다. 높이면 덜 흔들리지만 느려집니다.
- 최대 이동 속도: 기본 화면 길이 4/초. 큰 프레임 단위 점프를 제한합니다. 너무 낮으면 빠른 시선 이동을 따라가지 못합니다.
- 마지막 처리 영상이 350ms 이상 오래되거나 동공을 잃으면 `valid:false`, `x/y:null`입니다. 웹에서 마지막 좌표로 선택을 계속하지 마세요.
- Pi는 한 프레임을 보낸 뒤 Mac 처리 완료 ACK를 기다리고 다음 최신 영상을 고릅니다. 모든 프레임을 처리하려고 큐를 쌓지 않습니다. 네트워크/추론 지연이 커지면 실효 FPS가 낮아집니다.

## 6. 운영·중지·업데이트

Pi 진단:

```bash
sudo systemctl status eye-pi --no-pager
journalctl -u eye-pi -n 100 --no-pager
sudo systemctl restart eye-pi
# 비밀번호 확인 (이 파일은 외부에 공유하지 마세요)
cat ~/EyeTracker-pi/exhibition/pi-config.json
```

업데이트는 첫 파일 복사 명령을 다시 실행하고 `sudo systemctl restart eye-pi`를 실행합니다. 의존성이나 서비스 설정이 바뀌었다면 설치 스크립트를 다시 실행합니다. 카메라를 쓰는 기존 `pi_camera_stream.py` 등은 동시에 실행하지 마세요.

Mac 중지는 Ctrl+C. Pi 자동실행 중지는 `sudo systemctl disable --now eye-pi`. Pi 종료는 `sudo shutdown -h now` 후 활동 LED가 멈춘 것을 확인하고 전원을 분리합니다.

설정 파일 `exhibition/pi-config.json`, `exhibition/mac-config.json`은 자동 생성되고 Git에서 제외됩니다. 토큰/비밀번호를 포함하므로 공유하지 마세요. 현재 기본 `ws/http`는 암호화되지 않은 로컬 네트워크용입니다. 외부 인터넷에 포트를 공개하지 마세요. HTTPS 사이트는 브라우저가 `ws` 접근을 차단할 수 있으므로 아래 프론트엔드 매뉴얼의 WSS 배포 항목을 확인하세요.

## 7. 장비에서 반드시 확인할 목록

학생이 테스트했다고 전한 **기존 MJPEG 데모**와 이번 새 WebSocket 경로의 검증은 별개입니다. 이 작업 환경에는 Pi/GC0308이 연결되어 있지 않습니다.

- Pi 재부팅 후 SSH 없이 서비스/UI가 올라오는가?
- 실제 GC0308 장치 번호, 영상 방향, 동공 검출, 실효 FPS가 적절한가?
- Mac 끄기/켜기와 Wi-Fi 잠시 끊기 후 자동 재연결되는가?
- 관람객을 바꾸면 이전 보정이 폐기되고 재보정이 가능한가?
- 눈 감기/얼굴 이탈/카메라 분리 시 웹 선택이 즉시 멈추는가?
- 화면 중앙·모서리에서 선택이 정확한가? 10분 이상 동작 시 온도/전원/지연이 괜찮은가?

성능 목표 수치는 실제 설치에서 측정해 확정하세요. 문제가 생기면 Pi 로그, Mac 상태 JSON의 `tracking`, `ready`, `frame_age_ms`, `error`와 화면 미리보기를 함께 확인합니다.

## 개발 검증 기록 (2026-09-30)

현재 전시용 Mac 환경 Python 3.12.14 / aiohttp 3.14.3 / NumPy 2.5.3 / OpenCV 4.14.0에서 총 13개 자동 검사가 통과했습니다. 추가로 Python 컴파일, JavaScript 구문, 셸 스크립트 구문을 확인했고 Mac 브라우저에서 프로토타입 화면과 서버 연결을 확인했습니다.

```bash
.venv/bin/python -m unittest discover -s tests -v
```

- 9점 보정 수학, 잘못된 보정 입력 거부, 중앙값/시간 필터
- 포함된 `assets/eye_test.mp4`의 실제 트래커 추론 (GUI 호출 없이), 빈 영상 검출 실패
- Origin/관리 API 보호, 입력 검증, 설정 저장 권한
- 시뮬레이션 입력으로 9점 수집→중앙 검증→좌표 출력→stale 무효화→관람객 초기화
- 실제 JPEG WebSocket 수신/ACK, 잘못된 JPEG 무효화, 중복 카메라 거부, 연결 종료 초기화
- Pi 송신기를 가상 카메라로 실행한 실제 Mac 송신/ACK/자동 재연결
- Pi UI 인증 및 설정 저장 (물리 카메라 제외)

Pi OS 패키지 설치와 systemd 부팅은 이 Mac에서 실행하지 않았습니다. Wi-Fi와 실제 GC0308의 성능·정확도 검증도 위 현장 목록대로 별도로 진행해야 합니다.

추가로 `tests/test_install.py`에서 Git 다운로드/재설치, 설정 유지, 기존 파일·수정 코드 보호, 다운로드 실패 처리와 root 실행 거부를 검사했습니다. 이 검사는 git/설치 명령을 대체해 실행하므로 실제 Pi 패키지 설치 결과를 의미하지 않습니다.

두 사용자 확장 검사에서는 8080/8081에 해당하는 독립 앱의 좌표·토큰·세션·트래커 상태를 확인하고, 사용자 1 초기화/연결 종료 후 사용자 2 상태가 유지되는 것을 검증했습니다. 시작 스크립트의 두 사용자 프로세스 인자와 함께 종료되는 동작도 검사했습니다. 실제 두 Pi의 무선 동시 운용은 현장 검증 대상입니다.

## 통합 전시 운영 화면

두 사용자 서버를 시작한 뒤 이 Mac mini에서 `http://localhost:8080/admin`을 엽니다. 1P와 2P의 눈 영상, 동공 추출, 눈 모델 준비, 개인별 보정, 연결 상태와 처리 성능을 함께 확인합니다. “새 관람객”은 해당 사용자의 모델과 보정만 초기화합니다. “보정 화면”으로 이동해 작품 디스플레이에서 순서대로 보정하고, `http://localhost:8080/stage`에서 두 커서가 같은 화면 전체를 사용하는지 확인합니다. 실제 작품도 보정할 때와 같은 브라우저 뷰포트 크기와 디스플레이 위치로 실행합니다.

각 Pi에는 해당 사용자 카드의 **Pi 영상 전송 토큰**을 저장합니다. 별도 작품에는 **작품 시선 구독 토큰**을 전달합니다. “작품 구독에 토큰 요구”를 사용할 때는 학생에게 새 공통 클라이언트와 토큰 전달 예제를 함께 전달하세요. 관리자에서 작품 Origin을 두 사용자 모두에 저장합니다. 이 관리자와 확인 페이지는 Mac localhost 전용입니다. Mac의 OS Wi-Fi 설정, 절전 해제, 로그인 시 서버 자동 실행은 현재 자동화하지 않습니다. 전시 중에는 Mac이 잠자기에 들어가지 않도록 설정하고 서버 터미널을 유지하세요.

통합 관리자 추가 검사에서는 관리 페이지의 localhost 보호, 고정된 2P 서버 중계, 1P 초기화와 2P 초기화의 분리, 서버 연결 실패 표시를 검증합니다. 구독 토큰 검사는 영상 전송 토큰으로 작품 구독이 불가능한지, 시선 구독 토큰이 필요한 설정에서 인증이 적용되는지, 인증 설정 변경 시 기존 구독이 종료되는지 확인합니다. 폴더 정리 이후에도 `tracking/`의 실제 알고리즘과 `assets/eye_test.mp4`로 동일한 회귀 검사를 실행합니다.
