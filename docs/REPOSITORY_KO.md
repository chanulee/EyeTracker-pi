# 저장소 폴더 안내

기존 파일과 경로를 유지했습니다. Unity 경로·원본 실험 간 import가 깨지지 않도록 기존 소스를 이동하거나 삭제하지 않았습니다. 이번 전시 운영 진입점은 `scripts/`와 `exhibition/`입니다. `scripts/start-mac.sh --two-users`로 Mac의 두 독립 서버(8080/8081)를 시작해 사용자별 모델·보정·토큰을 분리합니다.

| 위치 | 내용 | 이번 구성에서 사용 |
|---|---|---|
| `exhibition/` | 새 Pi WebSocket 송신기, Mac 수신/보정/안정화 서버 | **주 경로** |
| `exhibition/web/` | Pi 원격 설정 UI, Mac 보정/타일 프로토타입, 프론트엔드 클라이언트 | **주 경로** |
| `install.sh` | GitHub 다운로드 후 기존 설치 스크립트를 실행하는 진입점 | 새 Pi 한 줄 설치 |
| `scripts/` | Pi 1회 설치 및 systemd 자동실행, Mac 시작 | **주 경로** |
| `docs/` | 한국어 설치·운영, 웹 학생 전달 계약, 저장소 지도 | **주 매뉴얼** |
| `tests/` | 하드웨어 없이 실행 가능한 보정·무효화·API/WebSocket 검사 | 개발 확인 |
| `3DTracker/` | 원본 단안/양안 3D 눈 모델, 선택적 OpenGL, Unity 출력 | 단안 `Orlosky3DEyeTracker.py` 알고리즘 재사용 |
| `3DTracker/gaze_cursor_server.py`, `gaze_demo.html` | 학생이 추가한 기존 파일 polling + SSE 커서 데모 | 기존 경로 보존; 새 서버와 별개 |
| `ForRaspberrypi/` | 학생의 기존 HTTP MJPEG 영상 송신기 | 기존 경로 보존; 새 Pi 송신기와 동시 실행 금지 |
| `FrontCameraTracker/` | 얼굴 앞 카메라 기반 별도 눈 추적 실험 | 이번 근접 눈 카메라 경로에서 사용하지 않음 |
| `HeadTracker/` | MediaPipe 얼굴/머리 방향으로 마우스 제어 | 별도 실험; 눈 방향과 구분 |
| `Webcam3DTracker/` | 일반 웹캠 눈/머리/화면 매핑 프로토타입 | 별도 실험 |
| `VREyeTracker/` | Unity VR 단안/양안 시각화 및 보정 C# | 별도 Unity 경로 |
| `OrloskyPupilDetector.py` | 원본 정밀 동공 검출 데모 | 보존 |
| `OrloskyPupilDetectorLite.py` | 경량 동공 검출 | 보존 |
| `OrloskyPupilDetectorRaspberryPi.py` | Pi에서 직접 OpenCV 창으로 동공 검출 | 보존; 이번 Pi에는 추론을 실행하지 않음 |
| `eye_test.mp4` | 원본 검출 시험 영상 | 실제 알고리즘 회귀 확인용 |
| `PI_DEMO.md` | 학생의 기존 Windows/MJPEG 데모 절차 | 이전 경로의 참고 자료 |
| `LICENSE` | 기존 MIT 라이선스 | 유지 |

## 학생이 추가한 기존 변경

현재 checkout에서 `a28d80a` 커밋이 `ForRaspberrypi/pi_camera_stream.py`, `3DTracker/gaze_cursor_server.py`, `3DTracker/gaze_demo.html`, `PI_DEMO.md`를 추가했습니다. 파일 내용 기준 영상은 MJPEG/HTTP, 브라우저 좌표는 SSE, 개인별 모델은 localStorage 저장 방식입니다. 기존 서버의 Pi 주소가 하드코딩되어 있어 새 구성은 JSON 설정/UI를 사용합니다. 커밋 기록만으로 실제 하드웨어 테스트 결과를 확인할 수는 없습니다.

## 이번 원본 알고리즘 수정

`3DTracker/Orlosky3DEyeTracker.py`만 공용 알고리즘으로 사용합니다. GUI 실행 시 기존 동작을 유지하면서, 새 Mac 서버가 화면 표시/파일 쓰기를 끄고 결과 딕셔너리에서 동공 품질·3D 방향을 읽을 수 있게 했습니다. Tkinter는 GUI를 실행할 때만 불러옵니다. 필터링된 contour 길이 조건과 정반대 방향 반환도 바로잡았습니다. NumPy 2에서 픽셀 밝기 합과 threshold 계산이 uint8 범위를 넘어 잘못되는 문제는 Python 정수로 계산해 수정했습니다. 별도의 동공 검출 알고리즘 복사본은 만들지 않았습니다.

다른 실험의 의존성은 전시 경로와 다릅니다. MediaPipe·PyAutoGUI·PyOpenGL·Tkinter 등을 새 전시 설치에 한꺼번에 설치하지 않습니다. 사용하려는 실험 폴더의 기존 readme를 먼저 확인하세요.
