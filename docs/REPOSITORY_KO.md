# 저장소 폴더 안내

전시 운영 코드는 `exhibition/`, 재사용하는 눈 추출 알고리즘은 `tracking/`, 이전 실험은 `legacy/`에 있습니다. 전시를 실행할 때는 루트에서 `bash scripts/start-mac.sh --two-users`를 사용합니다.

```text
EyeTracker-pi/
├── README.md                 전시 시작 안내
├── install.sh                새 Pi 설치 진입점
├── exhibition/               현재 전시 소프트웨어
│   ├── pi.py                 카메라 캡처·JPEG 전송·Pi 설정 서버
│   ├── mac.py                사용자별 추론·보정·시선 송출·관리 API
│   ├── gaze.py               보정 수학과 좌표 안정화
│   ├── common.py             설정 저장·입력 검증
│   ├── requirements.txt      Mac 실행 의존성
│   └── web/
│       ├── admin.html        1P·2P 통합 관리자
│       ├── index.html        사용자별 9점 보정·단일 커서 확인
│       ├── stage.html        같은 화면에 두 커서 확인
│       ├── pi.html           Pi 원격 설정
│       └── gaze-client.js    별도 작품 프론트엔드용 구독 클라이언트
├── tracking/                 Orlosky 눈 추출 알고리즘과 기존 3D 데모
├── scripts/                  Mac 시작·Pi 설치 스크립트
├── docs/                     설치·운영·프론트엔드 계약·참고 문서
├── tests/                    보정·통신·인증·설치 자동 검사
├── assets/eye_test.mp4        알고리즘 회귀 확인용 영상
├── legacy/                   현재 전시에서 실행하지 않는 예전 실험
└── LICENSE                   원본 MIT 라이선스
```

## 전시의 데이터 흐름

1P 카메라와 2P 카메라를 각각 Pi가 촬영합니다. Pi는 추론하지 않고 최신 JPEG를 Mac mini로 보냅니다. Mac mini는 독립된 두 처리 프로세스에서 동공·3D 방향·개인별 보정·좌표 안정화를 처리합니다. 1P는 8080, 2P는 8081입니다. 별도 작품 프론트엔드가 두 `/gaze` 스트림을 구독하고 같은 화면 전체에 두 커서를 표시합니다.

통합 관리자 `http://localhost:8080/admin`는 1P 서버에서 제공하며 2P의 고정 localhost 8081 관리 API를 중계합니다. 각 사용자의 눈 모델·보정·토큰·관람객 세션은 분리됩니다. 관리자 페이지 자체는 Mac localhost 전용입니다. 작품은 관리자 HTML에 구현하지 않고 별도 프로젝트에서 개발합니다.

## tracking과 legacy의 구분

`tracking/Orlosky3DEyeTracker.py`는 전시 서버에서 실제로 사용하는 공용 알고리즘입니다. GUI와 파일 출력을 끄고 동공 타원·품질·추정 방향을 결과 딕셔너리로 받습니다. Tkinter는 GUI 실행 때만 불러옵니다. NumPy 2의 uint8 연산 문제와 contour 조건 등을 수정한 코드입니다.

같은 폴더의 `Orlosky3DEyeTrackerStereo.py`, `gl_sphere.py`, `GazeFollower.cs`는 기존 양안·OpenGL·Unity 참고 구현입니다. `gaze_cursor_server.py`, `gaze_demo.html`은 학생의 이전 SSE 데모이며 새 WebSocket 전시 서버와 별개입니다. 기존 데모의 파일 간 위치 관계를 유지하기 위해 이 파일들은 알고리즘 폴더에 함께 보존했습니다. [이전 Pi 데모 안내](LEGACY_PI_DEMO.md)를 참고하세요.

| legacy 경로 | 용도 |
|---|---|
| `legacy/ForRaspberrypi/` | 이전 HTTP MJPEG 카메라 송신기 |
| `legacy/FrontCameraTracker/` | 얼굴 앞 카메라 기반 눈 추적 실험 |
| `legacy/HeadTracker/` | MediaPipe 머리 방향·마우스 제어 실험 |
| `legacy/Webcam3DTracker/` | 일반 웹캠 화면 매핑 실험 |
| `legacy/VREyeTracker/` | Unity VR 시각화와 보정 C# |
| `legacy/pupil-detectors/` | 정밀·경량·Pi 직접 실행 동공 검출 데모 |

MediaPipe·PyAutoGUI·PyOpenGL 등의 실험 의존성은 전시 설치에 포함하지 않습니다. 예전 카메라 송신기를 현재 `exhibition.pi`와 동시에 실행하면 카메라 장치를 충돌해 사용할 수 있습니다.

## 이전 경로에서 이동한 위치

| 이전 경로 | 현재 경로 |
|---|---|
| `3DTracker/` | `tracking/` |
| `ForRaspberrypi/`, `FrontCameraTracker/`, `HeadTracker/`, `Webcam3DTracker/`, `VREyeTracker/` | 각각 `legacy/` 아래 |
| 루트 `OrloskyPupilDetector*.py` | `legacy/pupil-detectors/` |
| 루트 `eye_test.mp4` | `assets/eye_test.mp4` |
| 루트 `PI_DEMO.md` | `docs/LEGACY_PI_DEMO.md` |
| README의 원본 소개 | `docs/UPSTREAM.md` |

Mac 알고리즘 로더와 자동 검사의 영상 경로도 새 위치를 사용합니다. 외부에서 예전 경로로 실행하던 단축 명령이나 IDE 설정은 새 경로로 바꿔야 합니다. Unity의 gaze 파일 위치는 원래부터 각 설치 환경의 절대 경로를 지정하는 방식입니다.

## 로컬 환경 파일

`.venv/`는 Mac 실행 환경이며 Git에서 제외됩니다. `exhibition/mac-config.json`, `exhibition/mac-user2-config.json`, `exhibition/pi-config.json`은 자동 생성되는 로컬 설정으로, 비밀번호·토큰이 있으므로 커밋하지 않습니다. Mac 보정은 메모리에만 유지합니다. 서버 재시작이나 Pi 재연결 후 해당 사용자를 다시 보정합니다.
