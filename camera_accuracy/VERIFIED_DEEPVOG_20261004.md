# DeepVOG 검증 + 지연 필터 (`deepvog-verified`) — 2026-10-04

목표: **딜레이는 조금 늘어나도 괜찮으니, 보정에 들어가는 값이 튀지 않게(동공↔홍채 전환 없이) 만들기.**
테스트 영상: `exhibition/assets/eye_test.mp4` (heeyun0301 저장소의 `eye_test.mp4`와 동일 파일, md5 `9fba77e8…`).

## 구조

DeepVOG를 "모든 프레임의 검출기"로 쓰지 않고 **동공인지 판정하는 검증기**로 씁니다.

1. **빠른 후보:** 기존 Orlosky가 매 프레임 동공 타원 후보를 냅니다(프레임당 수 ms).
2. **홍채 판정(밝기):** 후보 테두리 안쪽 띠가 회색(홍채)이고 그 안에 더 어두운 핵(동공)이 있으면, 후보를 버리고 핵만 다시 타원으로 맞춥니다(`dark_core`). 진짜 동공은 테두리 근처도 검습니다(반사광은 30백분위로 무시).
3. **DeepVOG 검증:** 3프레임마다, 그리고 **빠른 후보가 직전 확인된 동공 크기·위치를 벗어날 때마다** DeepVOG를 실행합니다. 후보 안의 DeepVOG 동공 확률 평균이 0.5 이상이면 통과하고, 아니면 DeepVOG 분할 결과를 대신 씁니다. 그 사이 프레임은 직전 확인된 동공 크기의 0.7–1.4배일 때만 통과합니다.
4. **지연 Hampel 필터:** 3프레임 뒤까지 본 다음, 주변 7프레임 중앙값에서 위치나 크기가 튀는 프레임을 **버립니다**(값을 보간하지 않음). 버린 프레임은 좌표 없이 내보내므로 `capture()`의 12프레임에 섞이지 않습니다.
5. **장면 전환/재착용 감지:** 영상이 크게 바뀌면 이전 동공 정보를 버립니다.

출력 `raw`는 기존 2D 경로와 같은 동공 중심 좌표이고, 9점 회귀·4점 검증·커서 필터는 그대로입니다.

## 실행

```bash
camera_accuracy/.venv/bin/python -m camera_accuracy.install_research   # DeepVOG 가중치 (이미 했다면 생략)
bash camera_accuracy/start.sh --engine deepvog-verified
```

화면의 검출기 목록에서 **DeepVOG 검증 + 지연 필터 (안정 우선)**를 고를 수도 있습니다. 최대 지름 기본값은 320px(640×480 작업 영상 기준)입니다.

## eye_test.mp4 결과 (1,033프레임, 장면 8개)

### 1) 눈으로 판정한 동공 정확도 — 60프레임 표본

17프레임 간격 60장에 각 검출기 결과를 겹쳐 그리고 눈으로 판정했습니다. 판정이 모호한 2장은 제외했습니다. 판정자는 1명이며 픽셀 단위 정답 라벨은 아닙니다.

| 경로 | 동공 맞음 | 틀림(주로 홍채) | 없음 |
|---|---:|---:|---:|
| 기존 Orlosky | 42 | **15** | 1 |
| DeepVOG 단독 (`research.py`, 찬우) | 29 | 0 | 29 |
| **deepvog-verified** | **51** | **3** | 4 |

예시 이미지: [audit-617-804.jpg](diagnostics/verified/audit-617-804.jpg), [audit-821-1008.jpg](diagnostics/verified/audit-821-1008.jpg)(빨강 Orlosky, 파랑 DeepVOG 단독, 노랑 verified). 남은 오류 3장은 홍채가 매우 어둡거나 동공이 대부분 가려진 프레임입니다.

### 2) 안정성 지표 (정답 없음)

| 경로 | 유효 프레임 | 32px 초과 점프 | 크기 급변 | 고주파 잔차 p95 | 12프레임 확보 창 비율 | DeepVOG 실행 |
|---|---:|---:|---:|---:|---:|---:|
| 기존 Orlosky | 1,030 | 144 | 89 | 28.9px | 98% | – |
| Route D (`orlosky-flow`) | 438 | 8 | 8 | 9.0px | 21% | – |
| DeepVOG 단독 (`research.py`) | 596 | 42 | 0 | 13.8px | 54% | 1,033 |
| **deepvog-verified (3프레임마다, 지연 3)** | **950** | 68 | **7** | 12.1px | **96%** | 416 (40%) |
| deepvog-verified (매 프레임, 지연 3) | 946 | 65 | 9 | 12.2px | 95% | 1,033 |

- **크기 급변**은 주변 15프레임 중앙값에서 지름이 40% 이상 벗어난 프레임 수로, 동공↔홍채 전환의 대리 지표입니다.
- **12프레임 확보 창 비율**은 피드를 13–18 FPS로 무작위 솎아낸 1.2초 창 중 유효 프레임 12개 이상인 창의 비율입니다.
- `capture()`의 p90 흔들림 통과율은 모든 경로가 3–5%입니다. 이 영상은 눈이 계속 움직이는 데모라 고정 주시 구간이 거의 없기 때문이고, 보정 성공률로 해석하면 안 됩니다. 남은 점프 일부도 실제 빠른 안구 운동입니다.
- 원자료: [verified-bench-20261004.json](diagnostics/verified/verified-bench-20261004.json) (프레임별 중심·지름 포함).

## 속도와 딜레이

- 이 클라우드 CPU에서 DeepVOG는 프레임당 약 1초였습니다. 찬우 님 측정 Mac MPS 값은 약 110ms입니다.
- 3프레임마다 + 필요할 때 실행하면 이 영상에서 프레임의 40%만 DeepVOG를 돌렸습니다. Mac 기준 **평균 약 50ms/프레임(약 20 FPS)으로 추정**하지만, 실행하는 프레임은 약 120ms가 걸려 처리 간격이 들쭉날쭉합니다. **실측은 아닙니다.**
- 출력은 **3프레임 지연**(20 FPS 기준 약 150ms)됩니다. 보정은 점을 띄운 뒤 0.9초를 기다리고 수집하므로 영향이 작습니다. 로그의 `tracker_details.source_frame`이 실제 원본 프레임 번호입니다.
- 실시간 커서가 너무 늦으면 `delay`를 줄이거나(1–2), `verify_every`를 늘리세요(6이면 DeepVOG 실행 25%, 이 영상의 지표는 거의 같았습니다).

## 재현

```bash
# 1) 기존 검출기 기준선
camera_accuracy/.venv/bin/python -m camera_accuracy.compare_detectors --video exhibition/assets/eye_test.mp4 \
  --frames 2000 --engines orlosky orlosky-stable orlosky-flow --output /tmp/baseline.json
# 2) DeepVOG 확률맵 캐시 (프레임별 240×320, CPU 약 17분 / MPS 약 2분) 후 비교
camera_accuracy/.venv/bin/python -m camera_accuracy.bench_verified --video exhibition/assets/eye_test.mp4 \
  --cache /tmp/deepvog-cache.npz --baseline /tmp/baseline.json --output /tmp/verified-bench.json
```

캐시 파일은 저장소에 넣지 않았습니다(약 150MB). 캐시를 만드는 코드는 `DeepVOGSegmenter`를 프레임마다 호출해 `prob`와 `gray`를 `np.savez_compressed`로 저장하는 형태입니다.

검사:
- `python -m unittest camera_accuracy.test_verified`: 4개 통과. 반사광 구멍 메우기, 홍채와 동공의 DeepVOG 지지도 분리, 지연 필터의 스파이크 제거, 홍채 후보가 출력되지 않음, DeepVOG가 매 프레임 실행되지 않음을 확인합니다.
- 기존 `camera_accuracy.test_accuracy`: 15개 통과(1개 skip, 네이티브 검출기 미설치 환경).

## 한계

- 이 영상은 여러 사람·카메라를 이어 붙인 데모입니다. GC0308 실착용 영상과 어두운 전시 조건에서의 결과는 아직 측정하지 않았습니다. 다음 단계는 실제 USB로 `deepvog-verified`의 1→9→4 기록 ZIP을 남기고, 같은 영상을 `orlosky-ecc`와 비교하는 것입니다.
- 정확도 표는 사람이 눈으로 판정한 것이고, 화면 시선 정확도가 아닙니다.
- `dark_core`의 기준(테두리-핵 밝기 차이 10)은 이 영상에서 정했습니다. 다른 카메라·노출에서는 다시 확인해야 합니다.
- DeepVOG는 GPL-3.0입니다(`vendor/deepvog/LICENSE`).
