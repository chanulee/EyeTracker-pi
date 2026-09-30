# 단안·아래쪽 눈 카메라의 3D 방향 실험

동공 타원의 찌그러짐과 여러 프레임을 이용해 눈 카메라 기준 3D 방향을 추정합니다. 기존 2D 타원 검출을 재사용하고 Pupil Labs `pye3d`를 붙였습니다. 기존 동공 중심 기반 벡터는 버리고 `pye3d`의 `circle_3d.normal`을 사용합니다. Core ML 모델을 새로 준비하지 않는 최소 구현입니다.

## 이 Mac에서 시작

별도 `.venv-pupil` 환경을 설치했습니다. 기존 서버 터미널에서 Ctrl+C로 종료한 뒤 실행합니다.

```bash
cd ~/Documents/GitHub/EyeTracker-pi
bash start-pupil.sh
```

`http://localhost:8080/admin`에서 `Pupil Labs 3D` 표시를 확인합니다. 기존 8080/8081 수신 주소와 토큰을 재사용합니다. 서버 재시작·카메라 재연결 후 모델과 보정은 초기화됩니다. `bash start-mac.sh`는 기존 Orlosky 엔진을 사용합니다.

다른 Mac은 Xcode Command Line Tools를 준비하고 `bash exhibition/scripts/install-pupil-mac.sh`로 설치합니다. Pi에서는 이 설치를 실행하지 않습니다. 공식 공개 저장소의 고정 커밋 `eb50e384ce131e2a27e0de058c25fa16254c63ed`를 빌드합니다. Eigen 헤더와 Python 패키지는 `.venv-pupil`에 들어가며 기존 `.venv`는 유지됩니다. [공식 저장소](https://github.com/pupil-labs/pye3d-detector)와 [고정 버전 LGPL-3.0 라이선스](https://github.com/pupil-labs/pye3d-detector/blob/eb50e384ce131e2a27e0de058c25fa16254c63ed/LICENSE)를 참고합니다.

## 확인 순서

1. 안경·카메라 위치를 고정하고 영상의 타원·십자가 실제 동공을 따라가는지 확인합니다. 초록색은 2D 형태 품질 기준 통과, 주황색은 기준 미달입니다. 초록 타원만으로 3D 방향이나 화면 좌표가 유효한 것은 아닙니다.
2. 눈을 좌우·상하로 천천히 움직여 다른 타원을 수집합니다. 최소 5초, 후보 30개 이상, 가로·세로 이동 범위와 `pye3d` 모델 검사를 모두 통과해야 준비 완료입니다. 같은 동공을 반복 입력하는 것만으로 준비 완료하지 않습니다.
3. 화면 정면을 1초 이상 보고 **정면 기준 저장**을 누릅니다. 최근 방향 12개 이상과 최소 0.8초 범위, 방향 흔들림을 검사합니다.
4. 좌우·상하를 보며 벡터와 상대 각도를 확인합니다. 정면 기준은 아래쪽 카메라의 기본 기울기에 대한 기준이며 카메라 roll이나 화면 위치 전체를 측정하는 보정은 아닙니다.
5. `http://localhost:5173`에서 해당 사용자의 **착용 확인 · 보정 시작**을 누르면 착용 완료 확인 → 모델 준비 → 정면 기준 수집 → 9점 보정 → 3점 검증을 안내합니다. 모두 통과하면 보정된 시선 커서가 부드럽게 움직입니다. 착용 완료는 관람객/운영자의 버튼 확인이며 착용을 자동 감지하지 않습니다. 점선 임시 커서는 보정된 화면 좌표가 아닙니다.

## 좌표와 파라미터

`direction`은 동공 광학 축의 단위 벡터이며 시각 축·화면 시선 보정 전 값입니다. 눈 카메라 좌표의 x는 이미지 오른쪽, y는 아래, z는 카메라에서 멀어지는 방향입니다. 카메라를 향하는 법선은 보통 z가 음수입니다. `origin`은 눈 구 중심의 mm 값입니다. [공식 출력 구조](https://docs.pupil-labs.com/core/developer/)를 참고합니다.

`relative_angles`는 저장한 정면 법선의 접평면에서 구한 yaw/pitch입니다. 양의 yaw는 영상 오른쪽, 양의 pitch는 기준에 대한 영상 위쪽입니다. 머리의 물리적 회전각이나 화면 좌표가 아닙니다. 카메라가 아래 있다는 이유로 피치에 임의의 일정 각도를 더하지 않습니다.

작업 영상은 640×480, 기본 초점거리 560px는 미측정 추정값입니다. 렌즈 왜곡은 아직 보정하지 않습니다. 정확한 각도에는 실제 내부 파라미터 측정이 필요합니다. 원본 폭 320px에서 측정한 초점거리는 작업 폭 640px에서 두 배로 입력합니다.

```bash
EYE_FOCAL_LENGTH_PX=560 bash start-pupil.sh
```

측정한 경우에만 `EYE_INTRINSICS_MEASURED=1`을 함께 지정합니다. 안경 위치를 바꾸면 모델과 정면 기준을 다시 초기화합니다.

우리 2D 품질은 Dice 형태 겹침으로 Pupil의 검출 확률과 다릅니다. 어댑터에 입력 임계값을 명시하고 `pye3d`의 유한 벡터·물리 범위 모델 검사를 추가로 통과한 경우에만 방향을 전달합니다. 모델 상태 0.1 또는 0에서는 방향을 무효화하며 이전 방향을 최신 값처럼 재사용하지 않습니다.

## Pi FPS 업데이트

이번 로컬 코드를 GitHub main에 push한 뒤 Pi에서 실행합니다. GitHub에 없는 변경은 내려오지 않습니다.

```bash
cd ~/EyeTracker-pi
bash exhibition/scripts/update-pi.sh
sudo systemctl status eye-pi --no-pager
```

기존 checkout에 업데이트 스크립트가 없거나 설치 위치가 다르면 최초 설치 명령을 다시 실행합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/chanulee/EyeTracker-pi/main/install.sh -o /tmp/eye-install.sh && bash /tmp/eye-install.sh
```

Pi UI에서 `auto` 전송, Pi 회전 끄기, 카메라가 지원하는 30 FPS 모드를 선택합니다. `transport_mode=camera-mjpeg`면 Pi 디코딩·재압축을 생략합니다. `captured_fps`, `output_fps`, Mac 처리 FPS를 비교합니다. Mac 3D 엔진 설치와 Pi 업데이트는 독립적입니다. 물리 Pi에서 지속 24 FPS 달성은 아직 검증하지 않았습니다.

## 초기 검증 기록

2026-09-30 실제 테스트 영상 360프레임 중 317개에서 모델 검사를 통과한 단위 방향, 202개에서 준비 완료 상태가 나왔습니다. 로컬 재생 처리 시간 중앙값 약 14ms, 95백분위 약 15ms였습니다. 네트워크 포함 FPS나 방향 정답 오차를 의미하지 않습니다.

실행 중인 Pi→Mac 영상의 12초 메모리 재처리에서는 126프레임 중 18개에서 방향, 7개에서 준비 완료 상태가 나왔습니다. 현재 착용 영상은 아직 불안정하며 렌즈 파라미터·동공 경계·모델 초기화를 더 확인해야 합니다. 기존 서비스는 재시작하지 않았습니다.

`.venv-pupil/bin/python -m unittest discover -s exhibition/tests -v`로 실제 3D 영상 재생, JPEG/ACK 수신부터 벡터·타원 미리보기까지, 기울어진 카메라의 상대 각도, 정면 기준 수집·초기화와 기존 기능을 검사합니다. 현장의 방향 정확도·지속 24 FPS 검증은 남아 있습니다.
