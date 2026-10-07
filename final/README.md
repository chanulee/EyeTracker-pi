# Seoul Visual AI · 전시 통합본

## 실제 `stream/` 대시보드로 작품 체험

Pi에서는 기존 `stream` 서버만 실행하고 대시보드의 **센서 읽기 켜기**를 누릅니다.
기존 `eye-final-camera` / `eye-final-sensors` 서버를 함께 실행하지 않습니다.
Mac에서 다음을 실행합니다 (현재 Pi IP로 바꿀 수 있습니다):

```bash
bash final/start-mac.sh --stream http://192.168.45.243:8090
```

DeepVOG 검증 + 지연 필터를 기본 엔진으로 사용하고, 기존 관람객 화면·보정·인터랙션을 유지합니다.
Mac의 `stream_bridge.py`가 Pi MJPEG를 기존 동공 서버에 전달하고,
`/state`와 `/audio`를 기존 프론트엔드 입력 형식으로 중계합니다.
`stream/` 코드와 프론트엔드 화면 코드는 변경하지 않습니다.
중계기는 Mac 내부 9081 포트만 사용하며 실행 종료 시 함께 종료됩니다.
Pi 센서 수집 상태는 종료 시 그대로 유지됩니다.

작품은 `http://localhost:3000/pre_opening`, 장비 점검은 `/hardware`,
영상·동공 진단은 `http://localhost:8080/admin`에서 확인합니다.
시선 인터랙션은 실제 눈 착용과 기존 화면 보정이 필요합니다.
음성 페이지는 기존 Chrome 기반 Web Speech 인식을 사용합니다. Pi 소리를 사용하려면
Chrome 135 이상과 인터넷이 필요하며 기존 Mac 마이크 fallback 동작도 유지합니다.
음성 파일 저장이나 Mac 로컬 STT를 추가한 구성은 아닙니다.
첫 설치는 `bash final/setup-mac.sh`, 코드 변경 후 빌드는 `bash final/start-mac.sh --build`입니다.

**카메라 1대, 실제 장치 착용자 1P(NABI), 장치 없이 안내하는 2P(SORA)** 구성입니다. Mac mini에서 Seoul-Visual-Ai 관람객 화면을 실행하고, Raspberry Pi 한 대의 눈 카메라·BNO086 IMU·I2S 마이크를 연결합니다. 이 폴더 전체로 설치하며 별도 학생 저장소 checkout은 필요하지 않습니다.

```text
1P Pi · 눈 카메라 1대 ─ JPEG ─→ Mac :8080 시선 처리
                                           ↓
                                     :5174 브리지
                                           ↓
Pi :8080 /api/stream ─ IMU·음량 ─→ Mac :3000 Seoul Visual AI
Pi :8080 /api/audio  ─ PCM 음성 ─→       관람객 화면
                                           ↑
                              2P SORA · 고정 안내 시나리오
```

Pi와 Mac의 8080은 서로 다른 기기의 포트입니다. SORA용 카메라·센서 서버·보정·음성 인식·모바일 접속은 기다리지 않습니다.

| 폴더 | 내용 |
|---|---|
| `frontend/` | Seoul-Visual-Ai 작품, 이미지·영상 214개, Pi 입력·SORA 시나리오 |
| `eye_tracking/` | Pi 영상 송신기, Mac 동공·시선 추출, 9점 보정·3점 검증 |
| `sensors/` | IMU·I2S 마이크 드라이버, 센서 대시보드, 추가한 PCM 스트림 |
| `tests/` | 실제 HTTP/WebSocket을 사용하는 연결·보정 검사 |
| `state/`, `.env` | 실행 시 생성하는 로컬 설정·토큰. Git 제외 |

## Mac mini 설치·실행

Node.js 20 이상, Python 3.10 이상이 필요합니다. 저장소 루트에서:

```bash
bash final/setup-mac.sh
```

`final/.env`의 `PI_SENSOR_URL_1`을 Mac에서 접근 가능한 Pi 주소로 수정합니다. 기본값은 `http://eye-pi-1.local:8080`이며, 필요하면 고정 IP를 사용하세요.

```bash
bash final/start-mac.sh
```

1P 시선 처리 서버, 브리지, production 작품이 함께 시작됩니다. Ctrl+C로 모두 종료하며 자식 서버가 실패해도 나머지를 함께 정리합니다. 이전 전시 서버와 포트가 겹치면 중단하고 알려줍니다.

| 주소 | 용도 |
|---|---|
| `http://localhost:3000/pre_opening` | 관람객 작품 시작 |
| `http://localhost:3000/hardware` | 1P 카메라·IMU·음량·음성 상태 |
| `http://localhost:3000/app` | 운영자 1P 보정 |
| `http://localhost:8080/admin` | Pi에 넣을 Mac 주소·영상 전송 토큰 |
| `http://localhost:3000/pi_mic_test` | 1P 마이크·음성 인식 점검 |

작품·보정은 Mac의 Chrome에서 `localhost:3000`으로 여세요. Pi 음성 인식은 `SpeechRecognition.start(audioTrack)`을 사용하며 코드상 Chrome 135 이상을 요구합니다. 미지원 브라우저 또는 Pi 음성 연결 실패 시 원본 방식대로 Mac 마이크로 전환하고 콘솔에 이유를 남깁니다. 시선 입력은 기본 설정에서 Pi 재연결을 계속 기다립니다. 모바일 QR은 Mac의 LAN 주소를 사용합니다.

## Pi 설치·연결

Pi의 hostname을 `eye-pi-1`로 설정하고 Mac과 같은 네트워크에 연결합니다. 이 통합본을 Pi로 복사/clone한 뒤 일반 SSH 사용자로 실행하세요.

```bash
bash final/install-pi.sh
sudo reboot
```

설치기는 I2C/I2S, 카메라 패키지, Python 의존성과 `eye-final-camera`, `eye-final-sensors` systemd 서비스를 등록합니다. 장치 중복 점유를 막기 위해 이전 `eye-pi` / `eye-pi-dashboard` 서비스는 중지·비활성화합니다. 기존 설정 파일은 보존합니다. 설치 때 출력되는 Pi 설정 UI의 `admin` 비밀번호를 기록하세요.

1. Mac에서 `bash final/start-mac.sh`를 실행하고 `http://localhost:8080/admin`을 엽니다.
2. Pi의 `http://eye-pi-1.local:8000`에 **`ws://MAC_IP:8080/camera`와 1P 영상 전송 토큰**을 저장합니다.
3. Mac의 `final/.env`에 `PI_SENSOR_URL_1=http://PI_IP:8080`을 설정하고 Mac 실행을 재시작합니다.
4. `/hardware`에서 연결을 확인합니다. `/app` 또는 작품 `/2`에서 **1P의 9점 보정 + 독립 3점 검증**을 완료합니다. SORA 보정 단계는 없습니다.

배선·전원은 [센서 배선표](sensors/README.md)를 따르세요. IMU RST 기본값은 GPIO24, Pi Zero I2C 기본값은 100 kHz입니다. 필요하면 `PI_I2C_BAUDRATE=50000 bash final/install-pi.sh`로 조절합니다.

```bash
systemctl status eye-final-camera eye-final-sensors
journalctl -u eye-final-camera -u eye-final-sensors -f
# 수동 실행 시 서비스를 먼저 중지
sudo systemctl stop eye-final-camera eye-final-sensors
bash final/start-pi.sh camera
# 다른 터미널
bash final/start-pi.sh sensors --game-rotation
```

전시 장비끼리 통신하는 신뢰할 수 있는 LAN을 사용하세요. Pi 센서 대시보드에는 인증이 없습니다. Mac 방화벽은 Pi 영상용 8080과 작품·모바일용 3000을 허용해야 합니다.

## 작품 입력과 SORA 시나리오

- **1P 눈 카메라:** Mac이 추출한 좌표를 응시·선택에 전달합니다. 무효 또는 350 ms 이상 지난 좌표는 선택을 중지합니다. 관람객 교체·재연결 뒤 다시 보정하세요. 입장과 자리 비움도 1P 눈 검출로 판정하므로 별도 Mac 웹캠은 필요하지 않습니다.
- **1P IMU:** 1P 차례의 거리뷰 방향에 연결합니다. 첫 방향과 정면 복귀 뒤 방향을 기준으로 yaw/pitch를 계산합니다. 장착 방향에 맞춰 `.env`의 `NEXT_PUBLIC_IMU_YAW_GAIN`, `NEXT_PUBLIC_IMU_PITCH_GAIN` 부호·배율을 바꾸고 재빌드하세요. IMU는 시선 보정값을 수정하지 않습니다.
- **1P 마이크:** 한 `arecord` 캡처에서 음량과 16 kHz S16_LE PCM을 함께 만듭니다. Mac은 발화 중에만 음성을 구독하는 `ondemand` 모드가 기본입니다.
- **2P SORA:** 정해진 위치 선택·발화·응답을 자동 진행합니다. 마이크와 응시 입력을 열지 않습니다. 안내 문장·위치·자치구별 기본 식물은 [guideScenario.mjs](frontend/src/f2/guideScenario.mjs)에서 수정합니다. 모바일은 NABI QR 하나를 제공하며, NABI의 그림 전송만 기다립니다. SORA 식물은 시나리오에서 채웁니다.

원시 센서값은 `useEntryFlow().sensorsRef.current['viewer-1']`에 있습니다. 영상 전송 토큰은 작품 브라우저에 전달하지 않습니다. 실제 착용자의 입력을 모의값으로 대체하지 않습니다.

## 모의 실행·검사

```bash
bash final/start-mac.sh --simulate
```

모의 Pi 하나(9080)가 IMU·음량·테스트 톤을 만들고, 가상 시선은 실제 보정 지점 순서를 따릅니다. 이 모드는 연결·화면 흐름을 확인하며 실제 눈 정확도나 말소리 인식 품질을 측정하지 않습니다.

```bash
cd final
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
node tests/test_hardware.mjs
# --simulate 실행 중 전체 production 경로 검사
.venv/bin/python tests/smoke_live.py
.venv/bin/python run.py --build
```

개발 모드는 `bash final/start-mac.sh --dev`입니다. 코드·`NEXT_PUBLIC_*` 설정을 바꾼 뒤 production 실행 전 재빌드하세요. Pi 주소 등 서버 설정은 재시작으로 반영합니다.

원본의 외부 거리뷰·세그멘테이션, Web Speech 인식, 선택적 OpenAI 질문·음성 API는 인터넷을 사용합니다. `OPENAI_API_KEY`가 비어 있으면 질문은 로컬 대체 문장으로 진행하며 OpenAI 음성 출력은 없습니다. SORA는 고정 텍스트만으로도 자동 진행합니다. 완전 오프라인 작품은 아닙니다.

통합 기준은 [SOURCES.md](SOURCES.md), 확인 결과는 [VALIDATION.md](VALIDATION.md)를 참고하세요. **실제 Pi 착용 보정, IMU 축, 현장 Wi-Fi 지연·마이크 인식·재부팅 복구는 현장 검증이 필요합니다.**

## 기본 동공 모델

기본값은 `DeepVOG 검증 + 지연 필터` (`deepvog-verified`)입니다.
`camera_accuracy/verified.py`와 기존 공식 가중치를 직접 재사용합니다.
Orlosky 동공 후보 → DeepVOG 영역 검증 → 3프레임 지연 필터 → 화면 보정 → 프론트엔드 순서입니다.
이 모델은 동공의 2D 중심을 보정 입력으로 사용하며 3D 시선 방향을 만들지 않습니다.
보정 지점 수집은 최소 1.2초, 유효 표본 12개를 위해 최대 4초까지 기다립니다.

현재 `.env`의 `EYE_TRACKER_PYTHON=../camera_accuracy/.venv/bin/python`으로
이미 설치된 DeepVOG 실행 환경을 재사용합니다. 새 Mac에서는 저장소 루트에서
`bash camera_accuracy/install-detectors.sh` 후
`camera_accuracy/.venv/bin/python -m pip install -r camera_accuracy/requirements-research.txt`와
`camera_accuracy/.venv/bin/python -m camera_accuracy.install_research`로 준비합니다.
기존 `bash final/start-mac.sh --stream http://192.168.45.243:8090` 명령으로 실행합니다.
비교가 필요하면 `.env`의 `EYE_TRACKER=orlosky`로 되돌릴 수 있습니다.
