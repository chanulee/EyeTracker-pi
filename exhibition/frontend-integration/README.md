# Mac compute ↔ 전시 프론트엔드

작품 화면은 개발팀의 `../frontend-example/`에 있습니다. 이 폴더는 compute 팀이 관리합니다.

현재 실행 구조는 Pi → Mac worker(8080/8081) → 로컬 bridge(5174) → 작품 Next 서버(5173)입니다. 작품은 브라우저 카메라 권한이나 MediaPipe 모델을 요청하지 않고 Pi의 눈 영상을 사용합니다. 모바일·opening WebSocket과 작품 장면은 기존 개발팀 서버가 처리합니다.

## 개발팀 코드에 필요한 연결 지점

- `server.js`: `createComputeProxy(require('ws'))`를 만들고 HTTP/upgrade 핸들러 맨 앞에서 호출합니다. 기존 `/ws/mobile`, opening 및 Next HMR 핸들러는 그대로 둡니다.
- `src/shared/EntryFlowContext.jsx`: React를 `createComputeIntegration(React)`에 넘겨 기존 `useGazeEngine` 인터페이스 대신 `useComputeGaze`를 사용합니다. `<ComputeCalibrationFeed engine={engine} />`는 보정 중 Pi 미리보기를 표시합니다.

작품의 장면·인터랙션·커서 컴포넌트는 수정하지 않았습니다. 이후 화면 교체 때 위 두 파일의 연결 지점을 유지하세요. 원래 웹캠 엔진은 프론트엔드에 남아 있지만 전시에서는 실행하지 않습니다.

## 작품 주소에서 사용하는 API

| URL | 용도 |
| --- | --- |
| `ws://localhost:5173/gaze?user_id=1` | A / viewer-1 / 1P 시선 |
| `ws://localhost:5173/gaze?user_id=2` | B / viewer-2 / 2P 시선 |
| `GET /api/players/1/status` | Pi·동공·눈 모델·보정 상태 (2P는 2) |
| `GET /api/players/1/preview?overlay=1` | 최신 Pi 눈 영상과 검출 타원 |
| `GET /api/players/1/plan` | 서버의 9점 보정과 독립 3점 검증 계획 |
| `POST /api/players/1/calibration` | 보정 begin/sample/validate/cancel/reset/neutral |

`/gaze`는 WebSocket입니다. 주소창으로 여는 일반 HTML 페이지가 아닙니다. 메시지 형식은 worker `/gaze`와 동일하며, `user_id`로 참가자를 구분합니다. `valid:true`의 정규 좌표 x/y를 작품 창의 `innerWidth/innerHeight`에 곱해 기존 엔진이 쓰는 CSS 픽셀로 전달합니다. 두 사람 모두 같은 화면 전체를 사용합니다.

bridge가 로컬 상태 폴더의 **시선 구독 토큰**을 worker에 전달합니다. 프론트엔드는 토큰을 하드코딩하거나 **Pi 영상 전송 토큰**을 알 필요가 없습니다. 5174 bridge와 작품의 compute 중계 경로는 이 Mac의 localhost 전용이며 외부 Origin의 쓰기 요청을 거부합니다. 다른 장비에서 작품을 띄우려면 [직접 구독 API](../docs/FRONTEND_KO.md)를 사용하세요.

## 보정과 커서

`http://localhost:5173/app`에서 Pi 영상이 들어오면 바로 미리보기가 표시됩니다. A=1P, B=2P이며 장치 드롭다운은 Mac 웹캠을 고르는 용도가 아닙니다. 연결된 Pi만 보정 순서에 포함합니다. 착용 후 눈을 여러 방향으로 움직여 모델이 준비되면 보정 시작 → 해당 참가자 시작 → 정면 기준(Pupil) → 9점 → 독립 3점 검증 → 참여 시작 순서입니다. 오류가 나면 화면의 안내를 확인하고 같은 단계 시작을 다시 누르거나 Esc로 취소합니다.

서버 보정은 9점으로 고정됩니다. 기존 작품 UI의 16점 선택은 서버를 바꾸지 않고 안내만 표시합니다. '정확도 측정'은 서버의 9점+3점 보정을 다시 수행합니다. 표시되는 px 오차는 정규 거리×화면 대각선의 상한 추정치이며 실제 픽셀 RMSE가 아닙니다.

보정된 좌표는 Mac 필터를 거친 뒤 브라우저 One Euro 필터로 전달됩니다. `valid:false`, 오래된 영상, 소켓 단절, 화면 크기 변경 때는 커서를 숨깁니다. 소켓은 자동 재연결합니다. Pi/서버 재시작 후에는 새로 보정해야 합니다. 관람객 착용 상태에서 정확도 확인은 운영자가 실제 점을 응시하며 진행해야 합니다.

## 실행·업데이트

처음 개발 환경에서는 Node.js와 작품 의존성을 설치합니다.

```bash
cd exhibition/frontend-example
npm install
cd ../..
bash start-pupil.sh
```

이 Mac의 자동실행은 저장소 대신 Library의 설치본을 실행합니다. 저장소 코드를 반영하려면 재설치하세요. 설치된 의존성과 Node 실행 파일도 함께 복사하고 기존 토큰·운영 설정은 유지합니다.

```bash
bash setup-autostart-mac.sh install
bash setup-autostart-mac.sh status
```

터미널 PATH에 Node가 없다면 `EYE_NODE=/절대/경로/node bash setup-autostart-mac.sh install`로 지정합니다. 이미 설치된 코드만 재시작하려면 `bash setup-autostart-mac.sh restart`입니다. 작품은 현재 `server.js` 기본값인 Next 개발 모드로 실행합니다. 별도 production 빌드/배포는 작품 팀과 함께 결정하세요.
