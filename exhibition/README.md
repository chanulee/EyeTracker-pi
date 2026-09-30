# 현재 전시 버전

이 폴더에는 Pi 소프트웨어, Mac mini compute server, 운영 UI, 별도 작품용 시선 구독 클라이언트와 실행·검증·운영 문서가 모여 있습니다. 현재 전시에 쓰지 않는 실험과 이전 데모는 루트의 [legacy](../legacy/)에 있습니다.

저장소 루트에서 실행합니다.

```bash
bash start-mac.sh --two-users
```

[통합 관리자](http://localhost:8080/admin)에서 1P·2P의 눈 영상, 추출 상태, 보정과 구독 연결을 확인합니다. 실제 작품 프론트엔드는 별도 프로젝트에서 개발하고 두 `/gaze` 스트림을 구독합니다.

| 위치 | 역할 |
|---|---|
| `pi.py` | Pi 카메라 캡처·JPEG 송신·설정 서버 |
| `mac.py` | Mac 추론·개인별 보정·시선 송출·관리 API |
| `gaze.py`, `common.py` | 좌표 안정화·보정 수학·설정 관리 |
| `tracking/` | 현재 사용하는 Orlosky 눈 추출 알고리즘 |
| `web/` | 통합 관리자·보정·Pi 설정·두 커서 확인·작품 구독 클라이언트 |
| `scripts/` | Mac 시작·Pi 설치 |
| `docs/` | 현재 전시 설치·운영·프론트엔드 계약 |
| `tests/` | 현재 전시 자동 검사 |
| `assets/` | 알고리즘 검증용 눈 영상 |
| `requirements.txt` | Mac 서버 라이브러리 |

설정 파일은 이 폴더에 자동 생성되고 Git에서 제외됩니다. 보정은 메모리에만 유지합니다. [문서 목록](docs/README.md)과 [전체 전시 가이드](../README.md)를 참고하세요.
