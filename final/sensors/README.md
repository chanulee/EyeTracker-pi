# Pi IMU · I2S 마이크

전시 통합본의 센서 서버입니다. 전체 설치·Mac 연결은 [상위 README](../README.md)를 따릅니다. 기본 8080 포트에서 센서 대시보드, 상태 JSON, SSE와 음성 PCM을 제공합니다.

| 주소 | 출력 |
|---|---|
| `/` | 센서 상태·진단 대시보드 |
| `/api/state` | IMU·음량 JSON |
| `/api/stream` | 20 Hz 센서 SSE |
| `/api/audio` | 16 kHz 모노 S16_LE PCM (WAV 헤더 없음) |

마이크를 읽는 arecord 프로세스 하나를 음량과 음성 구독자가 공유합니다. Mac이 음성 구독을 끊어도 음량용 캡처는 유지합니다.

## 1. 배선

Pi의 40핀 헤더 기준입니다. 핀 번호는 **물리 핀 번호**, 괄호는 BCM GPIO입니다.

**I2S 마이크**

| 마이크 | Pi 핀 |
|---|---|
| 3V | 핀 1 (3.3V) |
| GND | 핀 6 (GND) |
| SEL | 핀 9 (GND) → 왼쪽 채널 (모노) |
| BCLK | 핀 12 (GPIO18) |
| LRCL | 핀 35 (GPIO19) |
| DOUT | 핀 38 (GPIO20) |

**BNO086 IMU (I2C)**

| BNO086 | Pi 핀 |
|---|---|
| 3V3 | 핀 17 (3.3V) |
| GND | 핀 14 (GND) |
| SDA | 핀 3 (GPIO2) |
| SCL | 핀 5 (GPIO3) |
| RST | 핀 18 (GPIO24) → `--reset-pin 24` 로 하드웨어 리셋 |
| INT | 핀 11 (GPIO17) — 연결해 두었지만 코드는 사용하지 않음 |

> 두 센서 모두 **3.3V**에 연결하세요 (5V 금지). I2C와 I2S가 쓰는 핀은 서로 겹치지 않습니다.
> 3.3V(핀 1·17), GND(핀 6·9·14·20·25·30·34·39)는 서로 같은 전원이라 어느 것을 써도 됩니다.
> PS0/PS1은 아무 데도 연결하지 않아야 I2C 모드입니다.
> **배선은 Pi 전원을 끈 상태에서** 하세요.

## 설치·운용

저장소 루트에서 일반 SSH 사용자로 실행합니다.

```bash
bash final/install-pi.sh
sudo reboot
systemctl status eye-final-camera eye-final-sensors
```

I2C 속도 기본값은 100 kHz입니다. `PI_I2C_BAUDRATE=50000 bash final/install-pi.sh`로 낮춰 시험할 수 있습니다. RST는 GPIO24에 연결합니다.

수동 센서 서버 또는 별도 진단을 실행하기 전 자동 서비스를 중지하세요.

```bash
sudo systemctl stop eye-final-sensors
bash final/start-pi.sh sensors --game-rotation
# 선택: 마이크만/IMU만 제외
bash final/start-pi.sh sensors --no-mic
bash final/start-pi.sh sensors --no-imu
```

터미널 진단은 서비스가 중지된 상태에서 실행합니다.

```bash
cd final/sensors
../.venv-pi/bin/python check_all.py
../.venv-pi/bin/python test_mic.py --duration 10
../.venv-pi/bin/python test_imu.py --reset-pin 24
../.venv-pi/bin/python tools/imu_diag.py --reset-pin 24
bash tools/pi_status.sh
```

작업 후 `sudo systemctl start eye-final-sensors`로 복귀합니다. 기본 대시보드는 `http://eye-pi-1.local:8080`(2P는 eye-pi-2)입니다. 대시보드의 터미널 점검 버튼은 필요한 센서 리더를 잠시 중지한 뒤 복원합니다. 이때 해당 센서와 음성 스트림도 잠시 멈춥니다.

센서 없는 Mac에서 `python3 final/sensors/server.py --mock --port 9080`으로 실행하면 모의 IMU·음량과 220 Hz 테스트 톤을 보냅니다. 실제 말소리나 정확도 검증 자료가 아닙니다.

## 문제 해결

### 독립 3D 자세 뷰어 (LSM6DSO / BNO086 자동 선택)

[센서 연결·문제 해결 기록](SENSOR_BRINGUP_LOG.md)에 Pi 4B → Zero 2 W 이식,
최종 배선, BNO 풀업 처리 수정, USB 호스트 설정과 재실행 순서를 정리했습니다.
[부팅 자동 실행 설치 안내](AUTOSTART.md)는 검증된 8090 대시보드를
`eye-live-dashboard.service`로 실행하고 종료 시 다시 시작하는 방법입니다.

`tools/lsm6dso_live.py`는 기존 대시보드와 별도로 8090 포트에서 실행합니다.
같은 UI에서 센서별로 지원하는 값만 표시합니다.
기본 실행은 센서 읽기와 브라우저 수신이 꺼진 상태입니다. **센서 읽기 켜기 → 피드 받아오기** 순서로 누릅니다.
센서 읽기 끄기는 Pi의 수집 프로세스를 종료하며 전원은 유지합니다. 피드 수신 중지는 현재 브라우저 수신만 멈추고 Pi 수집은 계속합니다.
새로고침하면 수신은 꺼지고 Pi 수집 상태는 유지됩니다. 마이크 재생은 **듣기 시작**을 별도로 누릅니다.
서버 시작 즉시 수집하려면 `--start-sensors`를 지정합니다.
LSM6DSO는 가속도·자이로 XYZ, 온도, 가속도로 계산한 Roll/Pitch를 제공합니다.
Yaw 각도는 추정해 만들지 않으며 Z축 회전속도는 표시합니다.
BNO086은 가속도·자이로·자기장 XYZ, 중력·선형가속도 XYZ, Rotation Vector
쿼터니언을 읽어 Roll/Pitch/Yaw와 3D 전체 회전을 표시합니다.
기준 자세 버튼은 BNO에서 역기준 쿼터니언과 현재 쿼터니언을 곱하고,
LSM에서는 Roll/Pitch 오프셋을 뺍니다. 측정 벡터는 센서 자체 좌표계입니다.
LSM6DSO(0x6B/0x6A)를 먼저 찾고, 없으면 BNO086(0x4B/0x4A)을 초기화합니다.
BNO는 기존 `imu_init.py`의 패킷 처리와 초기화 재시도를 재사용합니다.
비정상 quaternion(길이 0.95~1.05 밖)은 정규화해 표시하지 않고 읽기 오류로 처리합니다.
BNO 보고 주기는 각 기능당 100ms(10Hz)로 지정해 여섯 보고서의 전송량을 제한합니다.
읽기 오류가 연속 20회 발생하면 연결을 정리하고 2초 후 다시 탐색합니다.
짧은 오류 때는 이전 자세를 유지하면서 이전 값임을 표시하며, 오류 종류와
누적 횟수·재연결 횟수·마지막 정상 읽기 후 경과 시간을 보여 줍니다.
이 복구 동작이 I2C 통신 오류의 근본 원인을 해결했다는 뜻은 아닙니다.
두 센서의 출력 단위는 가속도 g, 자이로 deg/s로 통일됩니다.

```bash
sudo apt install -y python3-venv swig build-essential python3-dev liblgpio-dev
python3 -m venv ~/lsm6dso-venv
~/lsm6dso-venv/bin/python -m pip install sparkfun-qwiic-lsm6dso adafruit-blinka adafruit-circuitpython-bno08x adafruit-extended-bus
~/lsm6dso-venv/bin/python final/sensors/tools/lsm6dso_live.py
```

Mac에서 `http://<Pi IP>:8090`을 엽니다. 센서 교체는 Pi 전원을 끄고 진행하고,
재부팅 후 같은 명령으로 실행하면 센서가 자동 선택됩니다. Qwiic 4선은
SDA→물리 16번(GPIO23), SCL→18번(GPIO24), 3.3V→17번, GND→14번으로 두 센서에 동일합니다.
기본값은 소프트웨어 I2C 버스 3입니다. `/boot/firmware/config.txt`에
`dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=23,i2c_gpio_scl=24`가 필요합니다.
센서 연결과 재연결 전에 GPIO23/24 풀업을 확인하고, 꺼져 있으면 `pinctrl`로 켭니다.
권한이 없으면 비대화형 `sudo -n`을 시도하며, 실패 시 대시보드에 실행할 명령을 표시합니다.
서버 자체를 root로 실행할 필요는 없습니다. 수동 복구는 다음과 같습니다.

```bash
sudo pinctrl set 23,24 pu
```

재부팅 때도 풀업이 필요하면 `config.txt`의 기존 `[all]` 구역에
`gpio=23,24=ip,pu`를 추가할 수 있습니다. 서버는 필요하면 풀업 명령을 다시 실행합니다. Zero 2 W 등에서는
`pinctrl get`의 풀업 표시가 `--`일 수 있으므로, 이를 설정 실패로 판단하지 않습니다.
풀업 설정 명령의 성공 여부와 실제 I2C 응답을 구분해서 확인합니다.
기존 하드웨어 버스 배선(SDA 물리 3번, SCL 5번)으로 돌아갈 때는
`--i2c-bus 1`을 사용합니다. 이 모드에서는 GPIO23/24 설정을 건드리지 않습니다.
서버 재시작 버튼도 지정된 버스 옵션을 유지합니다.
2026-10-08 독립 테스트에서 버스 3 + 풀업 + 회전 보고서 하나의 60초 수신을 확인했고,
이후 사용자가 Zero 2 W에서 대시보드의 BNO086·마이크·USB 카메라 동시 동작을 확인했습니다.
LSM 버스 3 자동 선택, 장시간 안정성, 재부팅 후 완전 자동 실행은 추가 확인이 필요합니다.
다른 BNO 리더가 실행 중이면 먼저 중지해 I2C 패킷을 동시에 읽지 않게 하세요.

마이크 입력 레벨(RMS/Peak dBFS)과 최근 100ms 파형도 같은 페이지에 표시합니다.
`듣기 시작`으로 Pi 마이크를 브라우저에서 재생합니다. 볼륨은 재생에만 적용됩니다.
SPH0645는 48kHz S32_LE 스테레오로 캡처한 뒤 왼쪽 채널(SEL=GND)을 선택하고,
기존 `audio_stream.py`로 DC 오프셋을 제거해 16kHz S16_LE 모노로 전송합니다.
`i2smic`/`googlevoicehat` 카드를 자동 선택하며 `--mic-device hw:3,0`으로
직접 지정하거나 `--mic-channel right`로 SEL=3.3V에 맞출 수 있습니다.
`--no-mic`은 IMU만 실행합니다. 마이크 오류는 IMU 표시를 중단하지 않습니다.
마이크를 점유하는 `eye-pi-dashboard`는 실행 전에 중지해야 합니다.

USB 아이 트래킹 카메라 영상도 같은 페이지에 MJPEG로 표시합니다.
기존 `eye_tracking/camera_device.py`로 UVC 캡처 노드만 탐색하고,
카메라가 여러 대면 `--camera-device /dev/video0`처럼 직접 지정합니다.
카메라는 한 번만 열어 여러 브라우저에 공유합니다. 영상은 최대 640×480,
최대 15fps, JPEG 품질 75로 전송하며 눈 추적 계산은 수행하지 않습니다.
USB 분리·읽기 실패 시 연결 상태를 표시하고 2초 뒤 같은 카메라를 다시 찾습니다.
연결 지연 시 이전 영상은 숨깁니다. 카메라 오류는 IMU·마이크를 중단하지 않습니다.
`--no-camera`는 카메라를 끕니다. 다른 앱이 카메라를 열고 있으면 먼저 종료합니다.
카메라 시작 정책은 `camera_accuracy/server.py`에 맞춰 320×240 해상도만 요청하고,
FPS·FOURCC를 강제하지 않습니다. 첫 프레임은 최대 1.5초 재시도하고,
실패하면 다음 연결에서 카메라의 기본 모드를 시도합니다. 별칭은 실제
`/dev/videoN`으로 풀어 OpenCV의 숫자 인덱스로 열고 V4L2 실패 시 CAP_ANY도
시도합니다. 열기에 실패하면 읽기/쓰기 접근 오류와 확인 가능한 점유 PID를 표시합니다.
`camera_accuracy`의 장치 탐색은 macOS용이므로 Linux UVC 탐색은 기존 도우미를 유지합니다.

페이지 상단의 연결 관리에서 IMU 재초기화, 마이크/카메라 다시 연결,
전체 다시 연결, 서버 재시작을 실행할 수 있습니다. 장치별 초기화 진행 상황,
최근 오류, 연결 작업 재시작 횟수를 표시합니다. 각각 독립된 프로세스에서
장치를 읽으므로 한 장치의 드라이버가 멈춰도 웹 버튼은 계속 응답합니다.
IMU는 25초, 마이크·카메라는 8초간 읽기/초기화 진행이 없으면 해당 작업만
종료하고 다시 시작합니다. 기존 작업과 녹음 자식 프로세스를 정리한 뒤
다시 열어 장치를 중복 점유하지 않습니다. IMU 재초기화는 I2C 드라이버와
측정 기능을 다시 여는 작업이며, Qwiic 4선만으로 전원을 재인가하지는 않습니다.
서버 재시작은 실행 옵션을 유지한 채 이 Python 프로그램만 다시 실행하며
Pi를 재부팅하거나 systemd 서비스를 시작하지 않습니다. 브라우저가 자동 재접속합니다.
서버 자체가 종료돼 웹에 접속할 수 없다면 Pi 터미널에서 다시 실행해야 합니다.
장치 제어는 같은 출처의 JSON POST만 받으며 외부 사이트의 제어 요청은 거부합니다.

IMU는 자동·BNO·LSM 모드를 명시적으로 선택할 수 있습니다 (`--imu-mode`도 지원).
`LSM 모드 경유 → BNO 재연결`은 기존 IMU 작업을 정리하고 LSM 주소만 2초간
탐색한 뒤 다시 정리하고 BNO 주소만 초기화합니다. 카메라·마이크는 유지합니다.
LSM이 실제로 없으면 LSM 연결은 실패하며 BNO에 LSM용 레지스터 명령을 보내지 않습니다.
이 버튼은 소프트웨어 모드 전환 실험이고, 실제 LSM 보드를 꽂았을 때의
전기적 효과를 재현하는 것은 아닙니다. UI에서 선택한 모드는 서버 재시작 후에도 유지합니다.

BNO가 Qwiic 전원을 뺐다 넣었을 때만 연결된다면 전원/부팅 상태와 소프트 리셋
경로를 구분해야 합니다. 웹 새로고침은 센서를 리셋하지 않습니다.
RST 선을 추가하면 IMU 재초기화 버튼에서 하드웨어 리셋도 수행할 수 있습니다.
Pi 전원을 끈 상태에서 **BNO RST → BCM17 / 물리 핀 11**을 추가하고
`--bno-reset-gpio 17`로 실행합니다. 기존 마이크·I2C 핀과 겹치지 않습니다.
이 옵션은 기본으로 꺼져 있습니다. 활성화하면 I2C 탐색 전에 RST를 20ms 낮추고
해제 후 700ms 기다립니다. 전원 재인가와 완전히 같은 동작은 아니며,
이 연결이 현재 BNO 문제를 해결하는지는 실제 하드웨어에서 확인해야 합니다.

```bash
~/lsm6dso-venv/bin/python -m pip install 'opencv-python-headless>=4.10,<5'
```

Pi 홈으로 파일만 복사해 실행할 때는 `lsm6dso_live.py`, `imu_init.py`,
`audio_stream.py`, `final/eye_tracking/camera_device.py`를 같은 폴더에 넣습니다.
하드웨어 없는 검증은 다음과 같습니다.

```bash
python3 final/sensors/tools/test_live_imu.py
python3 final/sensors/tools/test_live_controls.py
python3 final/sensors/tools/lsm6dso_live.py --mock
python3 final/sensors/tools/lsm6dso_live.py --mock --mock-sensor LSM6DSO
```

- **마이크 카드 없음:** `arecord -l`에서 googlevoicehat 카드가 있는지 확인하고 I2S overlay 설정 후 재부팅합니다.
- **마이크 device busy:** 별도로 실행한 test_mic 또는 이전 eye-pi-dashboard 서비스를 종료합니다. ALSA 장치 하나를 두 캡처 프로세스가 함께 열 수 없습니다.
- **마이크 값 0/고정:** DOUT·BCLK·LRCL·SEL 배선을 확인합니다. 카드는 드라이버만으로도 보일 수 있습니다.
- **IMU 주소 없음:** `i2cdetect -y 1`의 0x4B/0x4A와 전원·SDA·SCL을 확인합니다.
- **IMU 초기화/Unprocessable Batch 오류:** `imu_init.py`가 알려진 짧은 명령 패킷을 건너뛰는 패치를 적용합니다. 계속 실패하면 RST 연결, 짧은 I2C 배선과 속도를 확인하고 센서 전원을 다시 켭니다.
- **실내 yaw 흔들림:** 모니터·금속·스피커의 자장 영향을 확인하거나 `--game-rotation`으로 비교합니다. 장착 축·정면 기준은 Mac 작품의 IMU 설정과 함께 현장 조정합니다.

원본은 [youngchae407/eye-pi-sensor-test](https://github.com/youngchae407/eye-pi-sensor-test)이며 통합 변경은 [SOURCES.md](../SOURCES.md)에 정리했습니다.
