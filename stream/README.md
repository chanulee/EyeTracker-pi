# Pi → Mac 센서 스트리밍 대시보드

Raspberry Pi의 SPH0645 마이크, BNO086 / LSM6DSO IMU, USB 카메라를 Mac 웹브라우저에서 확인한다. 이 폴더 전체를 별도 저장소로 옮길 수 있다. Node.js, 웹 빌드, Mac용 서버는 필요 없다. HTML·JavaScript는 Python 서버 안에 포함돼 있다.

확인된 하드웨어는 Raspberry Pi Zero 2 W / Pi 4B, aarch64 Raspberry Pi OS, Python 3.13이다. 실제 성공·실패 조건은 [시행착오 기록](SENSOR_BRINGUP_LOG.md)에 정리했다. 새 SD 카드에서 아래 설치 절차 전체를 다시 검증한 것은 아니다.

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `lsm6dso_live.py` | HTTP 서버, 웹 UI, 장치 수집·재연결·제어 |
| `imu_init.py` | BNO 초기화, 채널 0/1 패킷 처리 보정 |
| `audio_stream.py` | PCM 변환, 브라우저별 오디오 큐 |
| `camera_device.py` | Linux UVC 캡처 장치 탐색 |
| `requirements.txt` | Python 의존성 |
| `boot/` | 마이크 overlay 소스, 부팅 설정 예시 |
| `install-live-dashboard.sh` | systemd 서비스 생성·설치·활성화 |
| `AUTOSTART.md` | 부팅 자동 실행, 상태 확인, 업데이트·철회 |
| `SENSOR_BRINGUP_LOG.md` | 배선, 시행착오, 복구·되돌리기 기록 |
| `test_live_imu.py`, `test_live_controls.py` | 하드웨어 없는 회귀 검증 |
| `SOURCES.md`, `LICENSE` | 출처와 라이선스 |

설치기가 현재 사용자 경로를 넣어 `.service`를 생성하므로 admin 계정 전용 서비스 파일은 별도로 필요 없다. 기존 실행 파일은 보존했고, 이 폴더는 분리 시점의 독립 사본이다. 이후 두 위치는 자동 동기화되지 않는다.

## 배선

숫자는 **물리 핀 번호**다. 전원을 분리한 상태에서 배선한다.

| 장치 신호 | 물리 핀 | 기능 |
| --- | ---: | --- |
| IMU SDA | 16 | GPIO23 / 소프트웨어 I2C 3 |
| IMU SCL | 18 | GPIO24 / 소프트웨어 I2C 3 |
| IMU 3.3V | 17 | 3.3V |
| IMU GND | 14 | GND |
| 마이크 3.3V | 1 | 3.3V |
| 마이크 GND | 6 | GND |
| 마이크 SEL | 9 | GND, 왼쪽 채널 |
| 마이크 BCLK | 12 | GPIO18 / PCM_CLK |
| 마이크 LRCLK | 35 | GPIO19 / PCM_FS |
| 마이크 DOUT | 38 | GPIO20 / PCM_DIN |

카메라는 Zero의 **USB** 포트에 OTG 어댑터로 연결한다. `PWR IN`은 전원용이다. 기본 구성은 IMU RST·INT 추가 배선이 없다.

## Pi 설치: 새 환경

아래 명령은 Pi 터미널에서 실행한다. 이 폴더를 `~/stream`에 복사했다고 가정한다. 기존에 작동하는 SD 카드라면 의존성·overlay를 덮어쓸 필요 없이 자동 실행 설치 단계로 진행한다.

OS 의존성:

```bash
sudo apt update
sudo apt install -y python3-venv python3-dev build-essential swig liblgpio-dev alsa-utils i2c-tools v4l-utils usbutils psmisc avahi-daemon device-tree-compiler
```

`pinctrl`도 필요하다. 검증한 Raspberry Pi OS에 기본 제공됐으며 `command -v pinctrl`로 확인한다. ALSA 녹음에는 `arecord`, 장치 점유 진단에는 `fuser`를 사용한다. Mac에는 별도 Python 패키지가 필요 없다.

Python 환경과 드라이버:

```bash
python3 -m venv ~/lsm6dso-venv
~/lsm6dso-venv/bin/python -m pip install --upgrade pip
~/lsm6dso-venv/bin/python -m pip install -r ~/stream/requirements.txt
```

`liblgpio-dev`는 과거 `cannot find -llgpio` 설치 실패를 해소하기 위한 시스템 의존성이다. OpenCV/NumPy는 카메라에 사용한다. requirements는 실제 Pi의 설치 버전을 동결한 lock 파일이 아니다. 설치 성공 후 `python -m pip freeze`로 현장 환경을 별도 기록할 수 있다.

장치 접근 그룹을 설정하고 다시 로그인한다:

```bash
sudo usermod -aG gpio,i2c,audio,video "$USER"
```

### 마이크 overlay와 부팅 설정

기존 `i2smic.dtbo`가 정상 동작한다면 그대로 사용한다. 새 SD 카드에서는 제공한 DTS를 컴파일한다:

```bash
dtc -@ -I dts -O dtb -o /tmp/i2smic.dtbo ~/stream/boot/i2smic-overlay.dts
sudo install -m 644 /tmp/i2smic.dtbo /boot/firmware/overlays/i2smic.dtbo
```

이 DTS는 검증 당시 사용한 `i2s_clk_producer` 심볼을 사용한다. 다른 커널에서 해당 심볼이 없으면 그대로 적용되지 않을 수 있다. 기존 `googlevoicehat-soundcard` 같은 동일 I2S 장치용 overlay는 함께 켜지 않는다.

```bash
sudo cp -n /boot/firmware/config.txt /boot/firmware/config.txt.before-stream
sudo nano /boot/firmware/config.txt
```

[boot/config.txt.snippet](boot/config.txt.snippet)의 항목을 `[all]` 아래에 반영한다. 전체 파일을 대체하지 않는다. 이미 있는 항목을 중복 추가하지 않는다. 저장 후 재부팅한다:

```bash
sudo reboot
```

## 실행과 부팅 자동화

재접속 후 기본 장치 상태를 확인한다:

```bash
sudo pinctrl set 23,24 pu
timeout -k 2s 10s i2cdetect -y 3 0x4a 0x4b
arecord -l
lsusb
ls -l /dev/v4l/by-id/
```

BNO는 `0x4b`에서 확인됐다. LSM은 `0x6b`/`0x6a`이므로 위 탐색 범위에는 나타나지 않는다. 장치가 준비됐으면 일반 사용자로 자동 실행 설치:

```bash
bash ~/stream/install-live-dashboard.sh
```

설치기는 `~/eye-live-dashboard/`로 실행 모듈 네 개를 복사하고 부팅 서비스를 생성한다. 기존 충돌 서비스는 중지·비활성화한다. 세부사항은 [AUTOSTART.md](AUTOSTART.md)를 따른다. 이후 Mac에서 `http://eye-pi-1.local:8090` 또는 `http://<현재 Pi IP>:8090`에 접속한다. 다른 호스트명이면 그 이름을 사용한다.

수동으로 시험하려면 자동 서비스를 먼저 중지한다:

```bash
sudo systemctl stop eye-live-dashboard
~/lsm6dso-venv/bin/python ~/stream/lsm6dso_live.py --i2c-bus=3
```

종료는 Ctrl+C, 자동 서비스 복귀는 `sudo systemctl start eye-live-dashboard`다.

## 웹 제어

1. **센서 읽기 켜기**: Pi에서 세 장치의 수집을 시작한다. 모든 브라우저에 적용된다.
2. **피드 받아오기**: 현재 브라우저에서 자세·측정값·마이크 파형·카메라 영상을 받는다.
3. **듣기 시작**: 마이크 오디오 재생을 별도로 시작한다.

**피드 수신 중지**는 현재 브라우저만 멈춘다. Pi는 계속 수집한다. 연결 상태만 1초 간격으로 받는다. **센서 읽기 끄기**는 Pi 수집 프로세스까지 종료한다. 센서 전원은 유지된다. 새로고침 시 브라우저 수신은 꺼지고 Pi 수집은 유지된다. OS 부팅 시 수집도 꺼진 상태로 시작한다. CLI `--start-sensors`로 시작 즉시 수집할 수 있다.

연결 관리에는 장치별 재초기화, 전체 다시 연결, 서버 재시작이 있다. 서버 재시작 버튼은 수집 상태를 유지한다. 드라이버가 멈추면 독립 수집 프로세스를 정리하고 재시도한다. LSM 경유 버튼은 소프트웨어 실험이며 전원 재인가를 재현하지 않는다.

BNO는 센서 융합 quaternion으로 Roll/Pitch/Yaw를 표시한다. LSM은 가속도 기반 Roll/Pitch와 자이로를 제공하며 Yaw를 만들어내지 않는다. 카메라는 영상만 제공하고 눈 추적 계산은 하지 않는다.

추가 옵션은 `--help`를 확인한다. 주요 옵션은 `--no-mic`, `--no-camera`, `--mic-device hw:1,0`, `--mic-channel left`, `--camera-device /dev/video0`, `--imu-mode BNO086`, `--i2c-bus=1`, `--port=8090`이다. 마지막 옵션에서 버스 1을 쓰려면 SDA/SCL 배선도 물리 3/5번에 맞춰야 한다.

## 하드웨어 없는 검증

이 폴더에서 실행한다. 두 테스트 파일은 Python 표준 라이브러리만 필요하다. 제어 테스트는 로컬 포트를 연다.

```bash
python3 test_live_imu.py
python3 test_live_controls.py
python3 lsm6dso_live.py --mock --no-camera
```

모의 카메라까지 보려면 OpenCV·NumPy를 설치하고 `--no-camera`를 뺀다. 모의 데이터는 실제 센서 측정이 아니다.

## 문제 해결

- **IP는 되는데 `.local`은 안 됨**: Pi의 현재 IP와 Mac에서 조회되는 IP를 비교한다. 우리 환경에서는 일반 DNS가 잘못된 공인 IP를 반환한 사례가 있었다. 서버·센서 문제와 분리해 확인한다.
- **서비스 masked / inactive**: `systemctl status eye-live-dashboard --no-pager -l`과 [자동 실행 안내](AUTOSTART.md)를 확인한다.
- **웹은 열리는데 센서가 꺼짐**: 현재 기본값이다. 센서 읽기와 수신을 순서대로 켠다.
- **카메라 LED만 켜짐**: `lsusb`에 나타나는지 먼저 본다. `[cm5]` 아래의 USB 설정은 Zero에 적용되지 않는다.
- **I2C 주소 없음**: 전원·핀 번호·풀업을 확인한다. Zero의 `pinctrl get`에서 `--`가 보인다고 풀업 실패로 판정하지 않는다.
- **마이크 무음·잡음**: SEL·DOUT·BCLK·LRCLK, 다른 녹음 프로세스의 점유, 마이크 자체를 확인한다. 이 작업에서는 마이크 교체 후 소리가 들어온 사례가 있었다.

세부 로그와 설정 복원 방법은 [시행착오 기록](SENSOR_BRINGUP_LOG.md)에 있다. 대시보드는 인증 없이 같은 네트워크에 제공하는 현장 진단 도구다. 카메라·마이크 스트림을 인터넷에 공개하는 배포는 포함하지 않는다.
