# 현재 전시에서 사용하지 않는 코드

현재 전시 소프트웨어는 [exhibition](../exhibition/)에 있습니다. 이 폴더에는 이전 실험, 데모, 원본 소개만 보존합니다. 전시를 실행할 때 이 폴더의 코드를 사용할 필요가 없습니다.

| 폴더 | 보존한 내용 |
|---|---|
| `3DTracker/` | 이전 양안·OpenGL·Unity·SSE 커서 데모 |
| `ForRaspberrypi/` | 이전 HTTP MJPEG 카메라 송신기 |
| `FrontCameraTracker/` | 얼굴 앞 카메라 눈 추적 실험 |
| `HeadTracker/` | 머리 방향·마우스 제어 실험 |
| `Webcam3DTracker/` | 일반 웹캠 눈·머리·화면 매핑 |
| `VREyeTracker/` | Unity VR 시각화 및 보정 |
| `pupil-detectors/` | 원본 동공 검출 데모 세 종류 |
| `docs/` | 원본 프로젝트 소개·이전 MJPEG/Windows 데모 안내 |

이 실험들은 전시와 다른 의존성과 하드코딩된 장치·파일 경로를 가질 수 있습니다. 원본 코드와 루트의 MIT 라이선스는 보존했습니다. 현재 Mac 서버가 재사용하는 단안 추출 알고리즘은 `exhibition/tracking/`에 있습니다.
