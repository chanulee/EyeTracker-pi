# 저장소 구조 — 현재 전시 / 이전 코드

루트의 두 폴더만 구분하면 됩니다. **`exhibition/`은 현재 전시에 필요한 모든 것**, **`legacy/`는 현재 전시에서 쓰지 않는 모든 코드와 참고 문서**입니다. 루트 README는 안내, `start-mac.sh`는 Mac 시작, `install.sh`는 새 Pi 다운로드 설치 진입점입니다.

```text
EyeTracker-pi/
├── README.md
├── start-mac.sh                     Mac 시작 진입점
├── start-pupil.sh                   Pupil Labs 3D 방향 실험 진입점
├── install.sh                       새 Pi 설치 진입점
├── LICENSE                          원본 MIT 라이선스
├── exhibition/                      현재 전시
│   ├── README.md
│   ├── pi.py                        카메라 캡처·JPEG 송신·Pi 설정
│   ├── mac.py                       추론·보정·시선 송출·관리 API
│   ├── gaze.py / common.py           보정·안정화·설정 저장
│   ├── requirements.txt             Mac 실행 라이브러리
│   ├── tracking/                    현재 쓰는 단안 눈 추출 알고리즘
│   ├── frontend-example/            별도 5173 예시 작품 (index.html 교체)
│   ├── frontend.py / startup.py      작품 서버·3단계 시작 안내
│   ├── web/                         관리자·보정·Pi 설정·두 커서 확인·구독 클라이언트
│   ├── scripts/                     Mac 시작 구현·Pi 설치
│   ├── docs/                        현재 전시의 운영·프론트엔드 문서
│   ├── tests/                       현재 전시 자동 검사
│   └── assets/eye_test.mp4           알고리즘 회귀 검사 영상
└── legacy/                          현재 전시에서 사용하지 않음
    ├── 3DTracker/                   이전 양안·OpenGL·Unity·SSE 데모
    ├── ForRaspberrypi/              이전 HTTP MJPEG 송신기
    ├── FrontCameraTracker/
    ├── HeadTracker/
    ├── Webcam3DTracker/
    ├── VREyeTracker/
    ├── pupil-detectors/
    └── docs/                        원본 소개·이전 Pi 데모 문서
```

## 전시 실행과 데이터 흐름

저장소 루트에서 `bash start-mac.sh --two-users`로 시작합니다. 실제 시작 구현은 `exhibition/scripts/start-mac.sh`에 있습니다. Pi 설치 구현은 `exhibition/scripts/install-pi.sh`입니다. Pi 설치 진입점인 루트 `install.sh`도 새 경로를 사용합니다.

1P와 2P의 Pi는 각각 눈 JPEG를 Mac으로 보내고 추론은 하지 않습니다. Mac mini는 독립된 두 프로세스에서 동공·추정 방향·개인별 보정·좌표 안정화를 처리합니다. 1P는 8080, 2P는 8081입니다. 별도 작품 프론트엔드가 두 `/gaze` 스트림을 구독하고 같은 화면 전체에 두 커서를 표시합니다.

`http://localhost:8080/admin`에서 두 사람의 상태를 함께 봅니다. 각 사람의 모델·보정·토큰·관람객 세션은 독립적입니다. 관리자 페이지는 Mac localhost 전용입니다. 작품 프론트엔드는 별도 프로젝트로 개발합니다.

## 실제 사용하는 알고리즘

`exhibition/tracking/Orlosky3DEyeTracker.py`는 기존 단안 알고리즘을 전시 서버에서 재사용하는 코드입니다. Mac에서는 GUI·OpenGL·파일 출력을 끄고 동공 타원·품질·추정 방향을 읽습니다. 알고리즘 내부의 기존 GUI 함수는 원본 보존을 위해 남아 있지만 전시 실행 경로에서는 호출하지 않습니다. 다른 실험용 라이브러리는 전시 설치에 포함하지 않습니다.

## 이동한 경로

| 이전 위치 | 현재 위치 |
|---|---|
| `tracking/Orlosky3DEyeTracker.py` (최초 `3DTracker/`) | `exhibition/tracking/Orlosky3DEyeTracker.py` |
| tracking의 양안·OpenGL·Unity·SSE 파일 | `legacy/3DTracker/` |
| `scripts/` | `exhibition/scripts/` |
| `docs/`의 현재 전시 문서 | `exhibition/docs/` |
| 원본 소개와 이전 Pi 데모 문서 | `legacy/docs/` |
| `tests/` | `exhibition/tests/` |
| `assets/eye_test.mp4` | `exhibition/assets/eye_test.mp4` |
| 루트의 예전 실험 폴더·동공 검출 데모 | `legacy/` 아래 |

기존 코드를 삭제하지 않고 분류했습니다. Mac 알고리즘 로더, 설치 스크립트, 검사와 문서 링크는 새 경로를 사용합니다. 외부 IDE 설정이나 단축 명령에서 예전 경로를 지정했다면 새 경로로 바꾸세요. 이전 단안 GUI/SSE 실험은 `legacy/3DTracker/readme.md`의 별도 실행 설명을 참고하세요.

## 로컬 파일과 검사

루트 `.venv/`는 설치된 Mac Python 환경이며 Git에서 제외됩니다. `exhibition/*-config.json`은 로컬 토큰·비밀번호 설정이며 공유하거나 커밋하지 않습니다. 보정은 메모리에만 유지하고 서버 재시작·Pi 재연결 후 다시 진행합니다.

```bash
.venv/bin/python -m unittest discover -s exhibition/tests -v
```
