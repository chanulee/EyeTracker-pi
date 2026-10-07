# Raspberry Pi 센서 대시보드 연결·문제 해결 기록

기록일: 2026-10-08  
대상: `lsm6dso_live.py`로 실행하는 8090 포트의 마이크·IMU·USB 카메라 대시보드

## 최종 결과

사용자가 Raspberry Pi Zero 2 W에서 **BNO086 회전 표시, SPH0645 마이크, USB 카메라가 모두 작동함**을 확인했다.
Pi 4B에서 테스트한 SD 카드와 소프트웨어를 Zero 2 W로 옮겨 사용했다.
다른 Zero 2 W로 교체한 뒤에도 점검을 이어갔다. 앞선 Zero의 고장이나 납땜 불량은 확정하지 않았다.

최종 확인 환경:

| 항목 | 확인된 상태 |
| --- | --- |
| 보드 | Raspberry Pi Zero 2 W |
| OS / 아키텍처 | Debian 기반 Raspberry Pi OS / aarch64 |
| 커널 | `6.18.50+rpt-rpi-v8` |
| 호스트명 | `eye-pi-1` |
| 마지막 확인 IP | `192.168.45.243` — DHCP로 변경될 수 있음 |
| Python 환경 | `/home/admin/lsm6dso-venv`, Python 3.13 |
| IMU | SparkFun BNO086 Qwiic, 주소 `0x4b`, 소프트웨어 I2C 버스 3 |
| 마이크 | SPH0645, ALSA `i2smic` — 최종 Zero에서는 card 1 |
| 카메라 | USB `0c45:6366`, `Microdia Webcam Vitade AF` |
| 카메라 캡처 경로 | `/dev/v4l/by-id/usb-Sonix_Technology_Co.__Ltd._USB_2.0_Camera_SN0001-video-index0` → `/dev/video0` |
| 서버 | `/home/admin/lsm6dso_live.py`, TCP 8090 |

이 기록은 연결과 동시 동작 확인이다. 재부팅 후 완전 자동 실행, 장시간 안정성, 눈 추적 정확도를 검증한 기록은 아니다.
후속 작업으로 [부팅 자동 실행 설치기](AUTOSTART.md)를 준비했다. 실제 Pi 설치와 재부팅 후 검증은 해당 안내에 따라 진행한다.

## 최종 배선

**아래 숫자는 물리 핀 번호다. GPIO 번호와 혼동하지 않는다.** 배선 변경 전에는 Pi를 종료하고 전원을 분리한다.

| 장치 | 신호 | 물리 핀 | Pi 기능 |
| --- | --- | ---: | --- |
| BNO086 / LSM6DSO | SDA | 16 | GPIO23, 소프트웨어 I2C |
| BNO086 / LSM6DSO | SCL | 18 | GPIO24, 소프트웨어 I2C |
| BNO086 / LSM6DSO | 3.3V | 17 | 3.3V 전원 |
| BNO086 / LSM6DSO | GND | 14 | 접지 |
| SPH0645 | 3.3V | 1 | 3.3V 전원 |
| SPH0645 | GND | 6 | 접지 |
| SPH0645 | SEL | 9 | 접지, 왼쪽 채널 선택 |
| SPH0645 | BCLK | 12 | GPIO18 / PCM_CLK |
| SPH0645 | LRCLK | 35 | GPIO19 / PCM_FS |
| SPH0645 | DOUT | 38 | GPIO20 / PCM_DIN |

BNO의 **물리 18번(GPIO24)**과 마이크의 **GPIO18(물리 12번)**은 다른 핀이다.
USB 카메라는 OTG 어댑터를 통해 Zero의 `USB` 포트에 연결한다. `PWR IN`은 전원용이다.
RST와 INT는 이번 최종 성공 조건에서 추가 연결을 요구하지 않았다.

## 최종 부팅 설정

`/boot/firmware/config.txt`의 **`[all]` 구역에 적용되는** 관련 설정은 다음과 같다.
아래는 관련 항목을 모은 예시이며 파일 전체를 덮어쓰는 용도가 아니다. 이미 있는 항목을 중복 추가하지 않는다.

```ini
[all]
dtparam=i2c_arm=on
dtparam=i2c_arm_baudrate=100000
dtoverlay=i2smic
dtoverlay=i2c-gpio,bus=3,i2c_gpio_sda=23,i2c_gpio_scl=24
dtoverlay=dwc2,dr_mode=host
```

- `i2c_arm_baudrate`는 기존 하드웨어 버스 설정이다. 소프트웨어 버스 3의 속도를 지정하는 항목이 아니다.
- `i2smic`은 앞서 만든 사용자 정의 마이크 overlay다. SD 카드를 새로 만들면 설정 줄뿐 아니라 해당 `.dtbo` 파일도 필요하다.
- 최종 수동 실행에서는 `sudo pinctrl set 23,24 pu`로 풀업을 켰다. 대시보드에도 풀업 설정 처리가 들어 있다.
- USB 호스트 테스트 때 파일 끝에 `[all]`과 `dtoverlay=dwc2,dr_mode=host`를 추가했고, 인식 성공 후 유지했다.
- `[cm5]` 아래의 같은 `dwc2` 줄은 CM5 전용이므로 Zero에 적용되지 않는다.

풀업을 부팅 설정으로 지정하는 `gpio=23,24=ip,pu`는 안내한 대안이다. 이번 최종 성공 로그에서 이 줄의 추가 여부는 확인하지 않았다.

## 다음에 켤 때 실행 순서

Mac에서 접속한다. `.local`이 해석되지 않으면 공유기에서 확인한 현재 IP를 사용한다.

```bash
ssh admin@eye-pi-1.local
```

아래부터는 **Pi 터미널**에서 실행한다. 같은 장치를 읽는 서버가 다른 터미널에 열려 있으면 먼저 `Ctrl+C`로 종료한다.

```bash
sudo systemctl stop eye-live-dashboard eye-pi-dashboard eye-pi
```

```bash
sudo pinctrl set 23,24 pu
```

```bash
timeout -k 2s 10s i2cdetect -y 3 0x4a 0x4b
```

BNO 사용 시 `4b`가 보여야 한다. LSM6DSO는 보통 `0x6b`이므로 위의 BNO 전용 탐색 범위에는 나오지 않는다.

```bash
arecord -l
```

`i2smic`이 있는지 확인한다. 카드 번호는 보드를 바꾸면 달라질 수 있으므로 대시보드의 자동 선택을 우선 사용한다.

```bash
lsusb
```

```bash
ls -l /dev/v4l/by-id/
```

카메라 USB 장치와 `video-index0`가 보이면 전체 대시보드를 실행한다.

```bash
~/lsm6dso-venv/bin/python ~/stream/lsm6dso_live.py --i2c-bus=3
```

Mac 브라우저에서 `http://<현재 Pi IP>:8090`에 접속한다. 마지막 확인 주소는 `http://192.168.45.243:8090`이었다.

기능을 나눠 확인할 때:

```bash
# IMU만
~/lsm6dso-venv/bin/python ~/stream/lsm6dso_live.py --i2c-bus=3 --no-mic --no-camera
```

```bash
# IMU + 마이크
~/lsm6dso-venv/bin/python ~/stream/lsm6dso_live.py --i2c-bus=3 --no-camera
```

각 실행 사이에는 이전 서버를 `Ctrl+C`로 종료한다.

## IMU 시행착오와 확인된 사실

| 시도 / 관찰 | 결과와 해석 |
| --- | --- |
| 하드웨어 I2C 버스 1, 100kHz | 주소 탐색 또는 초기화에서 시간 초과가 있었고, 데이터를 받다가 읽기 오류가 발생하기도 했다. |
| BNO → LSM → BNO 교체 | 한때 연결이 살아났다는 관찰이 있었으나 이후 재현되지 않았다. 원인이나 확정 복구 방법으로 채택하지 않았다. |
| LSM 경유를 버튼으로 재현 | 드라이버 종료·재탐색 실험이었다. 실제 LSM 보드 연결의 전기적 효과를 재현하지 못하며, 가짜 측정값 생성은 해결책으로 채택하지 않았다. |
| 원본 Adafruit 드라이버로 독립 테스트 | BNO 초기화 후 기능 활성화에서 채널 0의 `01 0e`를 처리하다 `Unprocessable Batch bytes` 발생. |
| 명령/실행 채널 처리 보정 적용 | 실제 quaternion 수신에 성공했지만, 이후 I2C 읽기 오류가 남았다. 보정만으로 전체 문제가 해결되지는 않았다. |
| 하드웨어 버스 400kHz | 비정상 quaternion과 채널 번호 처리 `IndexError` 발생. 100kHz로 복원했다. |
| GPIO23/24 소프트웨어 버스 3 | 버스 생성은 성공. 처음에는 두 핀이 LOW이고 주소가 보이지 않았다. |
| GPIO23/24 내부 풀업 설정 | 핀이 HIGH로 올라가고 `0x4b` 감지에 성공했다. |
| 납땜된 노출 핀을 손으로 만짐 | 오류와 관련 있다는 사용자 관찰이 있었다. 전기적 영향과 기계적 접촉 불량 중 어느 쪽인지는 확정하지 않았다. |
| 노출 핀을 만지지 않고 버스 3 + 풀업으로 테스트 | 60초 완료, 정상 범위 읽기 290회, 시작 직후 0 quaternion 1회. 읽기 횟수는 고유 센서 패킷 수가 아니다. |
| 앞선 Zero 2 W로 이식 | 버스 3은 생성됐지만 BNO 주소가 보이지 않았다. 보드 불량·납땜 불량은 확정하지 않았다. |
| 다른 Zero 2 W 사용 | `0x4b` 감지 성공. 이후 서버의 잘못된 풀업 확인 조건을 수정해 IMU 동작 확인. |

### 대시보드 코드에 반영한 변경

- 기본 IMU 버스는 3이다. `ExtendedI2C(3)`으로 BNO에 연결한다.
- LSM도 명시적으로 선택된 버스의 Qwiic 드라이버를 전달받는다. 기본 버스 1로 몰래 돌아가지 않도록 했다. 단, LSM의 버스 3 실측 성공은 이번 기록에 없다.
- 연결·재연결 전에 GPIO23/24 풀업을 설정한다. 직접 설정 권한이 없으면 `sudo -n`을 시도하고, 실패 시 실행할 명령을 화면에 표시한다.
- Zero 계열에서는 `pinctrl get`의 풀업 표시가 `--`일 수 있다. **`--`를 풀업 OFF나 설정 실패로 판정하지 않는다.** 설정 명령의 종료 상태와 실제 통신을 구분한다.
- 채널 0/1을 센서 데이터처럼 해석하지 않도록 기존 `imu_init.py` 보정을 유지한다. 이 처리가 명령 메시지의 근본 원인을 해결했다는 뜻은 아니다.
- 길이가 0.95~1.05를 벗어난 quaternion은 정상화해서 자세로 보여주지 않고 오류로 처리한다.
- 마이크·카메라 UI 및 재시작 기능을 유지했다. `--i2c-bus 1`은 기존 물리 3/5번 배선으로 돌아갈 때 사용하는 옵션이다.

초기 구현은 풀업 설정 뒤 `pu` 표시를 반드시 요구해 Zero에서 정상 연결을 막았다. 공식 GPIO 구현의 읽기 제한을 확인하고 해당 사후 판정을 제거했다.
앞서 대화에서 `--`를 풀업이 꺼진 상태로 설명한 것도 잘못이었으며, 이 문서의 설명으로 정정한다.

## USB 카메라 시행착오

1. IR LED는 켜졌지만 `lsusb`에는 루트 허브만 있었고 `/dev/v4l/by-id/`도 없었다.
2. 같은 어댑터로 마우스와 USB 메모리도 감지되지 않았다. 카메라 앱이나 UVC 장치 선택 이전의 USB 문제로 범위를 좁혔다.
3. 기존 `dtoverlay=dwc2,dr_mode=host`가 `[cm5]` 구역에 있었다. Zero에서는 기존 `dwc_otg` 호스트가 실행 중이었으므로, 단순히 호스트가 전혀 없었다고 결론 내리지는 않았다.
4. `[all]` 구역에 `dtoverlay=dwc2,dr_mode=host`를 추가하고 재부팅했다.
5. 로그에서 `dwc2_hsotg` 사용을 확인했고, Rapoo 마우스 수신기 `24ae:9db6`가 감지됐다.
6. 같은 어댑터에 카메라를 연결하자 `0c45:6366`과 캡처 경로가 나타났다. 전체 대시보드에서도 사용자가 동작을 확인했다.

이 비교에서는 호스트 설정 변경이 효과가 있었다. 이것이 모든 Zero의 USB 문제를 해결하는 보편적 설정이라는 뜻은 아니다.

## 오류별 판단과 되돌리기

| 증상 / 변경 | 판단 또는 복원 방법 |
| --- | --- |
| `Unit eye-final-sensors.service not loaded` | 그 서비스가 설치되지 않았다는 뜻이다. 반복해서 중지하거나 이 때문에 센서 설정을 바꾸지 않는다. |
| `I2C frequency is not settable in python, ignoring!` | Linux I2C 속도를 Python에서 변경하지 못한다는 경고다. 실제 연결 성공 여부와 별도로 판단한다. |
| `Unprocessable Batch bytes`, 채널 0 | 기존 보정 적용 여부를 확인한다. 무조건 모든 예외를 무시하지 않는다. |
| I2C `Errno 110`, `Errno 5`, `Errno 6` | 각각 시간 초과·입출력 실패·주소 응답 실패가 발생한 위치를 확인한다. 같은 원인이라고 단정하지 않는다. |
| `pinctrl`에서 두 선 HIGH | 쉬는 신호 상태에 관한 단서다. 전원·배선·실제 센서 통신까지 정상이라는 증거는 아니다. |
| USB LED만 켜짐 | 전원 공급과 데이터 장치 인식은 별개다. `lsusb`로 확인한다. |
| 카메라 `video-index1` | 이번 카메라는 `video-index0`가 캡처 경로였다. 두 번째 노드를 임의로 캡처 장치로 고르지 않는다. |
| `unrecognized arguments: 3` | 표시된 정상 명령과 실제 입력이 다른지 확인한다. `--i2c-bus=3` 형태로 새로 입력한다. |
| 수동 풀업 변경 | 부팅 시 재설정이 필요할 수 있다. 이번 실행 순서 또는 서버의 시작 처리를 사용한다. |
| 400kHz 비교 실패 | 기존 `i2c_arm_baudrate`를 100000으로 복원하고 재부팅했다. |
| 소프트웨어 I2C를 철회할 때 | 전원 OFF 후 SDA/SCL을 물리 3/5번으로 복원하고 서버를 `--i2c-bus=1`로 실행한다. 버스 3 overlay를 제거하려면 설정 수정 후 재부팅한다. |
| USB 호스트 변경 실패 시 계획했던 복원 | `/boot/firmware/config.txt.before-usb-host` 백업으로 복원 후 재부팅하는 방법을 준비했다. **이번에는 성공했으므로 복원하지 않았다.** 이후 다른 설정을 바꿨다면 파일 전체 복원은 그 변경도 지우므로 주의한다. |

## 유지할 원칙

- 한 번에 설정 하나를 변경하고, 변경 전후의 주소 감지·초기화·실제 데이터 수신을 따로 기록한다.
- `Connected`나 주소 감지만으로 성공이라고 판단하지 않는다. 움직일 때 값이 변하고 오류 없이 지속되는지도 확인한다.
- 전원이 켜진 상태에서 노출 핀을 만져 재현하지 않는다. 보드를 비전도성 받침에 놓고 케이블 장력을 줄인다.
- 장치 번호와 IP는 고정값으로 가정하지 않는다. SD 카드에 저장된 설정은 유지되더라도 보드별 장치 열거는 달라질 수 있다.
- 최종 수동 실행의 성공을 자동 시작·장시간 안정성 검증으로 확대하지 않는다.

## 참고 자료

- [SparkFun BNO086 하드웨어 안내](https://docs.sparkfun.com/SparkFun_VR_IMU_Breakout_BNO086_QWIIC/hardware_overview/) — I2C 타이밍, 보드 풀업, RST·INT 설명.
- [Adafruit 소프트웨어 I2C 안내](https://learn.adafruit.com/raspberry-pi-i2c-clock-stretching-fixes/software-i2c) — `i2c-gpio`와 Extended Bus 사용.
- [Pi 4 BNO085 소프트웨어 I2C 공개 프로젝트](https://github.com/robert-stevenson-1/BNO085-ROS2-Node) — 이번 우회 실험의 참고 사례. BNO086에서의 보편적 해결 보장은 아니다.
- [Adafruit 드라이버 이슈 #49](https://github.com/adafruit/Adafruit_CircuitPython_BNO08x/issues/49) — BNO086의 채널 0 오류 사례. 해당 보고의 보드는 Linux Pi가 아닌 Pico다.
- [Raspberry Pi 공식 GPIO 구현](https://github.com/raspberrypi/utils/blob/master/pinctrl/gpiochip_bcm2835.c#L260) — 구형 GPIO 풀업 상태를 읽을 수 없는 이유.
- [Raspberry Pi 설정 파일 안내](https://www.raspberrypi.com/documentation/computers/config_txt.html) — 보드별 조건 구역과 `[all]` 적용 범위.

## 후속 작업: 부팅 서비스와 피드 제어

- `eye-live-dashboard.service`가 enabled/active로 실행되고, 시작 전 풀업 설정과 BNO 연결 성공 로그를 확인했다. 서비스 설치 경로는 `~/eye-live-dashboard/`다.
- 초기 서비스 정의가 0바이트라 masked로 표시됐던 문제는 정상 정의를 설치해 복구했다. 설치기에도 빈 파일 방지 검사를 반영했다.
- 현재 UI는 **센서 읽기 켜기 → 피드 받아오기**를 눌러 사용한다. 수집 중지와 브라우저 수신 중지는 별개다. 상세 동작은 [README](README.md)를 따른다.
- Mac에서 `.local` 이름이 Pi IP와 공인 IP 둘 다 반환되는 현상을 확인했다. Mac에 설정된 DNS 서버 두 곳에 직접 질의했을 때 `218.38.137.27`이 반환됐다. `/etc/hosts`에는 해당 이름이 없었다. DNS 변경 후 해결 여부는 아직 확인되지 않았다. 현재 IP 직접 접속은 성공했다.
- `stream/`으로 분리한 버전은 로컬 테스트를 수행했다. 새 SD 카드 설치와 실제 Pi에서의 재배포 검증은 별도다.
