# 통합 기준 · 2026-10-08

이 폴더는 아래 소스의 스냅샷입니다. 서브모듈이나 다른 로컬 checkout을 참조하지 않습니다. upstream에 자동 동기화되지 않습니다.

| 구성 | 출처 | 기준 |
|---|---|---|
| 작품 UI | [JiyuShin/Seoul-Visual-Ai](https://github.com/JiyuShin/Seoul-Visual-Ai/tree/f41283a2617a5b9e7bc852c83fda3f28bfab9ab1) | `main`, `f41283a2617a5b9e7bc852c83fda3f28bfab9ab1` |
| 시선 처리·카메라 송신 | [chanulee/EyeTracker-pi](https://github.com/chanulee/EyeTracker-pi/tree/4d3a116) | 로컬 HEAD `4d3a116`, `exhibition/`의 운영 코드 |
| IMU·I2S 마이크 | [youngchae407/eye-pi-sensor-test](https://github.com/youngchae407/eye-pi-sensor-test/tree/511de1f5c42bb44c8e939251d069d4ec3e1ce56f) | `main`, `511de1f5c42bb44c8e939251d069d4ec3e1ce56f` |

2026-10-08 upstream 기본 브랜치 main으로 화면·스타일·에셋을 교체했습니다. 작품 에셋 215개는 해당 커밋의 Git blob SHA-1과 모두 일치합니다. 최신 3초+22초 대기 시퀀스와 오프닝을 유지하며, 기존 1P Pi 입력·SORA 고정 시나리오·모바일 연결을 재적용했습니다. Pi 입장 신호는 시퀀스를 즉시 건너뛰지 않고 upstream의 arm 경로로 연결합니다. 기존 화면은 `work/frontend-backup-20261008/`에 보관했습니다. 외부 저장소나 PR은 수정하지 않았습니다.

추가·변경한 부분:

- `run.py`, Mac/Pi 설치·실행 스크립트: 이 폴더 안에서 production 작품 + 1P worker + bridge를 실행. 종료·자식 실패 시 함께 정리. 로컬 설정과 토큰은 `state/`에 분리.
- `frontend/src/shared/EntryFlowContext.jsx`: Pi 모드에서 웹캠 자동 대체를 제거해 늦게 켜진 Pi도 재연결. `/app`의 운영자 보정도 허용.
- `frontend/src/shared/piMic/`, `src/f2/useSpeechInput.js`, `src/f2/DiscussionStep/index.jsx`: 1P Pi 음성 입력을 연결하고 SORA 차례에는 음성 인식을 열지 않음.
- `sensors/audio_stream.py`, `sensors/server.py`: 기존 48 kHz S32_LE 마이크 캡처에서 16 kHz S16_LE PCM 스트림을 생성하고 `/api/audio`로 제공. 레벨 계산과 같은 장치를 공유. 모의 모드에는 테스트 톤 추가.
- `frontend/src/shared/piSensors/`, `src/f2/DiscussionStep/StreetCanvas.jsx`, `StreetPanorama.jsx`: 센서 SSE 중계·참가자별 IMU 정면 기준과 거리뷰 방향 연결. 연결 손실·오래된 센서값 무효화.
- `StreetCanvas.jsx`: 시선 입력이 끊기면 진행 중인 응시 선택을 초기화.
- `useComputeGaze.js`: 보정 실패 시 다시 시도/취소 버튼. `pages/hardware.jsx`: 통합 장비 점검. `pages/app.jsx`: 참가자별 운영자 보정 화면.
- `eye_tracking/`: 기존 운영 알고리즘 보존. 입력 경로는 카메라 1대·1P만 실행. 실행 경로·설정 기본값을 이 폴더에 맞춤. 모의 worker를 실제 Pi 연결과 구분해 상태에 표시.

- `guideScenario.mjs`, `DiscussionStep`: SORA의 선택·발화·답변을 고정 시나리오로 자동 진행. 1P만 보정하고 마이크를 사용.
- `pre_opening`, `FlowIdleGuard`: 별도 Mac 얼굴 웹캠 대신 1P 눈 검출로 입장·자리 비움 판정.
- 모바일 QR·식물 전송: NABI만 실제 접속/전송하며 SORA 식물은 자치구별 시나리오 값 사용.

- 페이지 전환: View Transition 안에서 다음 렌더 프레임을 기다리던 교착을 제거. 애니메이션 취소가 전역 오류 복구를 촉발하지 않도록 처리.

기존 `camera_accuracy/`의 커밋되지 않은 실험 변경은 편입하거나 수정하지 않았습니다. 최신 실험용 DeepVOG 경로를 전시 기본값으로 전환하지 않았으며 기본 추정기는 기존 운영용 Orlosky입니다. `EYE_TRACKER=pupil` 선택 시 해당 선택 의존성을 별도 준비해야 합니다.

원본의 저작권·라이선스는 각 출처를 따릅니다. EyeTracker의 MIT LICENSE를 `eye_tracking/LICENSE`에 보존했습니다. 이 문서가 학생 작품이나 에셋에 새로운 라이선스를 부여하지 않습니다.

기본 동공 모델: `camera_accuracy/verified.py`의 `VerifiedTracker`와 `camera_accuracy/models/DeepVOG_weights.h5`를 직접 재사용합니다. 기존 Orlosky 후보를 DeepVOG로 검증하고 3프레임 지연 필터를 적용하며, 출력은 2D 동공 중심입니다.
