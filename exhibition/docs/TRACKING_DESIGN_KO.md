# 근접 눈 영상 추적·보정과 24 FPS 개발안

2026-09-30 조사 및 로컬 검사 기록입니다. 이후 단안·아래쪽 카메라에서 타원 찌그러짐을 이용하는 요구에 맞춰 [Pupil Labs 3D 실험](PUPIL3D_KO.md)을 추가했습니다. `start-pupil.sh`는 실제 3D 모델, `start-mac.sh`는 기존 엔진을 사용합니다. 아래 별도 2D 엔진은 대안 개발안입니다. 착용 확인·정면 안내·9점 보정·3점 검증과 두 커서는 현재 예시 작품에 구현했습니다. 물리 Pi의 지속 24 FPS와 보정 정확도도 아직 측정하지 않았습니다.

## 구현 방향

Pi는 카메라 영상을 전송하고 Mac에서 동공 검출과 보정을 수행합니다. 320×240 원본에서 어두운 동공 영역을 찾고 반사광을 고려해 타원 중심을 추정합니다. 가장 어두운 픽셀만 추적하면 속눈썹이나 그림자에 붙으므로 크기, 형태, 주변 대비, 이동량을 함께 확인합니다. 이전 동공 주변 ROI를 탐색하고 실패하면 전체 영상에서 다시 찾습니다.

2D 중심 `(u,v)`를 화면 9점에 대응시켜 `gaze.py`의 다항식 보정을 재사용합니다. 3D 눈 모델이 준비되지 않아도 보정 가능한 별도 엔진으로 만들고 기존 엔진과 비교합니다. 결과는 화면 좌표 또는 상대적인 상하좌우이며 실제 공간의 시선 벡터가 아닙니다. 눈 카메라 하나만으로 머리와 화면의 상대 위치 변화는 알 수 없으므로 고정된 관람 위치가 전제입니다. 자유로운 머리 움직임은 외부 위치 기준이나 추가 센서가 필요합니다.

## 착용·보정 흐름

1. 연결 → 영상과 동공 검출 타원 확인.
2. 약 1초간 안정적인 동공 검출 → “눈 영상 확인 완료 · 착용 위치를 고정하세요”. 영상만으로 실제 착용을 증명하지 않으므로 관람객 또는 운영자가 “착용 완료”를 확인합니다.
3. “정면의 점을 보세요” → 중앙 기준과 동공 크기 수집.
4. 화면 9점을 순서대로 표시 → “이 점을 보세요”. 이동 직후·깜빡임·실패 프레임은 제외하고 안정적인 유효 프레임이 모일 때 진행합니다. 실패한 점만 재시도합니다.
5. 학습에 쓰지 않은 여러 점에서 오차 확인. 중앙 한 점만으로 전체 정확도를 판정하지 않습니다.
6. 검증 통과 → 작품 시작. 검출이 끊기면 좌표 무효화, 착용 위치가 바뀌면 재보정.

1P·2P는 독립 세션으로 동일 작품 디스플레이와 뷰포트에서 차례로 보정합니다.

## 참고 구현과 Apple 기능

- [Pupil Labs pupil-detectors](https://github.com/pupil-labs/pupil-detectors): 독립 Python `Detector2D.detect(gray)`와 타원 결과를 제공합니다. Mac 빌드 안내가 있습니다. 아직 설치하거나 채택하지 않았으며 arm64 호환성과 구성요소별 라이선스 확인이 필요합니다.
- [Pupil Capture](https://docs.pupil-labs.com/core/software/pupil-capture/): 2D 동공 검출, 화면 마커를 따라보는 보정, 검증을 분리합니다. 전체 시스템은 world camera도 사용하므로 우리 구성과 동일하지 않습니다.
- [Pupil Player](https://docs.pupil-labs.com/core/software/pupil-player/): 2D gaze mapping에 다항식 회귀를 사용한다고 설명합니다.
- [PuRe-open](https://github.com/pupil-labs/PuRe-open), [PuRe 논문](https://arxiv.org/abs/1712.08900): 실시간 동공 검출 비교 후보입니다. 우리 영상의 검출률과 처리 시간을 비교한 뒤 선택합니다.
- [Apple 얼굴 랜드마크](https://developer.apple.com/documentation/vision/vndetectfacelandmarksrequest): 얼굴을 찾은 뒤 눈·입 특징을 검출합니다. 근접 단안 IR 영상에 바로 적용된다는 근거는 없습니다.
- [VNTrackObjectRequest](https://developer.apple.com/documentation/vision/vntrackobjectrequest): 먼저 찾은 물체의 bounding box 추적입니다. 동공 중심 계산과 시선 보정을 대신하지 않습니다.
- [VNCoreMLRequest](https://developer.apple.com/documentation/vision/vncoremlrequest): 별도 Core ML 모델 실행이 가능합니다. IR 동공 모델은 별도로 확보·검증해야 하고, 작은 영상의 전통적 검출보다 빠르다고 가정하지 않습니다. 이 Mac에서 Vision 샘플 실행도 시도했으나 Swift/SDK 모듈 충돌로 실행되지 않았습니다. 실측 성공·성능을 주장하지 않습니다.

## 24 FPS 확보 순서

24 FPS는 프레임당 약 41.7ms입니다. 한 프레임 송신 후 Mac 처리 완료 ACK를 받으므로 Pi 출력, 네트워크 왕복, Mac 추론 모두 영향을 줍니다. Mac 처리 23ms가 곧 전체 수신 43 FPS라는 뜻은 아닙니다.

Pi에서 `v4l2-ctl -d /dev/video0 --list-formats-ext`로 MJPEG 해상도별 FPS를 확인합니다. 지원되는 낮은 해상도와 30 FPS를 요청하고 Pi `captured_fps`, `output_fps`, Mac `processing_fps`를 비교합니다. 실제 카메라가 15 FPS이면 Mac만 바꿔 24 FPS에 도달할 수 없습니다. 노출 시간도 프레임 주기 안에 들어와야 합니다.

이번 로컬 수정:

- Pi `transport=auto`: 카메라가 지원하면 MJPEG 바이트를 그대로 송신해 Pi의 디코딩·축소·그레이 변환·JPEG 재압축을 생략합니다. 미지원이면 기존 인코딩으로 복귀합니다. 실제 `transport_mode=camera-mjpeg`인지 확인합니다. 물리 Pi 검증은 남아 있습니다.
- 회전은 Mac에서 수행합니다. Pi 회전은 재인코딩합니다. 직송 JPEG 품질은 카메라가 정하며, MJPEG는 센서 RAW가 아닌 압축 영상입니다.
- 누적 시각 FPS 제한: 기존 30 FPS 입력에 20 FPS 제한은 매 두 번째 프레임만 보내 약 15 FPS가 될 수 있었습니다. 가상 30 FPS 입력의 20/24/30 FPS 출력 검사가 통과했습니다.
- 동공 형태 품질: 확대 JPEG에 취약한 고정 4픽셀 경계 겹침 대신 채운 윤곽과 타원의 Dice 겹침을 비교합니다. 추가 임계값 후보도 비교합니다. 이 점수는 검출 확률이나 화면 좌표 정확도가 아닙니다.
- Mac 관리자는 후보 없음, 후보 품질 부족, 방향 계산 실패를 구분합니다. 이전 실제 영상 한 장을 재처리했을 때 형태 품질 약 0.19 → 0.88로 검출 기준을 통과했습니다. 전체 보정 성공을 뜻하지 않습니다.

다음 비교는 새 320×240 2D 검출, ROI 탐색, 디코딩, 왕복 ACK 시간 순서입니다. 네트워크가 병목이면 최신 프레임 하나만 유지하는 수신/처리 분리도 비교합니다. 1P·2P 동시 지속 FPS·지연과 깜빡임·반사광·시선 이동·안경 미끄러짐에서 검출률·보정 오차를 측정합니다.

## 적용 상태

로컬 수정은 Mac 재시작 및 Pi 업데이트 전에는 실행 서비스에 반영되지 않습니다. GitHub push는 하지 않았습니다. 코드가 GitHub에 올라간 뒤 Pi에서 `bash exhibition/scripts/update-pi.sh`, Mac은 `bash start-mac.sh`로 재시작합니다. 토큰은 유지되지만 다시 보정합니다. 작품 내 착용 안내와 보정은 구현했으며 별도 2D 엔진은 후속 비교 대상입니다.
