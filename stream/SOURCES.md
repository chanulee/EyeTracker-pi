# 출처와 분리 범위

2026-10-08 EyeTracker-pi 작업 폴더에서 8090 대시보드만 독립 구성으로 복사했다.
상위 저장소의 Python 모듈·프론트엔드·빌드 도구를 참조하지 않는다.

| 파일 | 분리 전 위치 / 기반 |
| --- | --- |
| `lsm6dso_live.py` | `final/sensors/tools/lsm6dso_live.py`; 이번 작업에서 작성한 독립 대시보드 |
| `imu_init.py`, `audio_stream.py` | `final/sensors/`; IMU·I2S 마이크 기반은 [youngchae407/eye-pi-sensor-test](https://github.com/youngchae407/eye-pi-sensor-test/tree/511de1f5c42bb44c8e939251d069d4ec3e1ce56f), 이후 이 작업에서 보정·스트리밍 추가 |
| `camera_device.py` | `final/eye_tracking/camera_device.py`; EyeTracker-pi의 Linux UVC 탐색 도우미 |
| `install-live-dashboard.sh` | `final/sensors/tools/install-live-dashboard.sh`; 파일 경로만 독립 구조에 맞춤 |
| 두 테스트 파일 | `final/sensors/tools/test_live_*.py` |
| 두 운영 문서 | `final/sensors/AUTOSTART.md`, `final/sensors/SENSOR_BRINGUP_LOG.md`; 경로와 후속 확인 내용 갱신 |
| `boot/i2smic-overlay.dts` | 대화에서 사용한 사용자 정의 `simple-audio-card` DTS 재구성. 실제 Pi의 설치된 바이너리를 추출한 파일은 아님 |

상위 EyeTracker-pi의 MIT LICENSE를 보존했다. 이 묶음은 의존 라이브러리나 upstream 코드에 새로운 라이선스를 부여하지 않는다. 각 출처의 조건은 그대로 적용된다.
외부 라이브러리 소스·녹음·카메라 영상·venv·비밀번호는 포함하지 않았다.
