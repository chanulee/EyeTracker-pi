# 교체 가능한 예시 작품

`bash start-pupil.sh`로 Pupil 3D 엔진, `bash start-mac.sh`로 기존 엔진과 함께 `http://localhost:5173`을 엽니다. 1P·2P는 같은 화면 전체를 사용하는 하늘색·주황색 커서입니다.

라이브 눈 영상(동공 타원 포함)을 4Hz로 확인하고, 보정 전에는 추정 방향을 화면에 임시로 매핑한 점선 커서를 표시합니다. 영상 미리보기 갱신은 시선 처리 FPS와 별개입니다. 각 카드의 **착용 확인 · 보정 시작**을 순서대로 누릅니다. 전체 화면 진입 → 착용 완료 확인 → 3D 모델 준비 → 정면 안내 → 9점 수집 → 독립된 3점 검증 → 실선 시선 커서로 진행합니다. Pupil 엔진의 정면 기준은 자동 수집합니다. 실패한 단계는 같은 위치에서 다시 시도하거나 취소/Esc로 처음부터 시작합니다. 두 사용자의 모델과 보정은 독립적입니다.

좌표 계산·품질 검사·보정·필터는 Mac compute server에 있습니다. 프론트엔드는 브라우저 표시 간격에 맞춰 시간 기반 보간을 추가합니다. 추적이 끊기면 커서를 숨기고, 보정한 뷰포트 크기가 달라지면 재보정을 안내합니다. 임시 커서는 타일 인터랙션에 사용하지 않습니다. 3점 검증은 전체 화면 정확도를 보장하지 않으므로 실제 착용 영상으로 확인하세요.

## 파일별 역할

- `index.html`: 작품과 안내 화면 구조.
- `style.css`: 색·배치·커서·보정 점 디자인.
- `app.js`: 두 시선 구독, 영상 표시, API 연결과 화면 상태.
- `flow.js`: 보정 순서, 임시 좌표와 커서 보간. 화면을 갈아끼울 때 재사용할 수 있습니다.

같은 정적 사이트로 작품을 개발하면 이 폴더만 수정하세요. 파일은 `/assets/파일명`으로 제공합니다. Pi 송신과 Mac 추론은 별도입니다.

## localhost 작품 API

예시 서버 `exhibition/frontend.py`는 고정된 8080/8081 포트로 아래 경로만 중계합니다. `user`는 1 또는 2이며 POST는 같은 작품 Origin에서만 받습니다.

| 작품 경로 | compute server |
|---|---|
| `GET /api/players/{user}/status` | `/api/status` |
| `GET /api/players/{user}/preview?overlay=1` | `/preview.jpg?overlay=1` |
| `GET /api/players/{user}/plan` | `/api/calibration-plan` |
| `POST /api/players/{user}/calibration` | `/api/calibration` |
| `POST /api/players/{user}/demo` | `/api/demo` (`--simulate`에서만) |

`/connection.json`은 두 시선 구독 주소와 구독 토큰만 제공합니다. Pi 영상 전송 토큰이나 설정 API는 중계하지 않습니다. 시선은 compute server의 `/gaze`로 직접 구독합니다. 보정 명령 계약은 [프론트엔드 매뉴얼](../docs/FRONTEND_KO.md)을 참고하세요.

## 별도 서버로 교체

React/Vite 등 별도 서버를 사용할 때 기존 실행을 Ctrl+C로 종료한 뒤 실행합니다.

```bash
bash start-pupil.sh --frontend-url http://localhost:5173
```

내장 예시 프로세스는 시작하지 않으므로 작품 담당자가 자신의 서버를 실행합니다. 위 localhost 영상/보정 중계도 새 서버에서 구현하거나 기존 Mac 운영 화면을 사용하세요. 브라우저가 외부 작품 Origin으로 compute 관리 API를 직접 호출하는 것은 허용하지 않습니다. `/gaze` 연결 코드는 재사용할 수 있습니다. 주소는 로컬 `exhibition/server-config.json`에 유지되며 내장 예시로 돌아가려면 `--frontend-url ''`를 사용합니다.

## 테스트

```bash
bash start-pupil.sh --simulate
```

착용 완료 후 마우스로 점을 따라갑니다. 실제 서버가 `simulate:true`일 때만 마우스 입력을 보내며 실제 눈 모드에서는 동작하지 않습니다. 시뮬레이션은 카메라 정확도 검증이 아닙니다.
