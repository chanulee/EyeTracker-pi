# 교체 가능한 예시 작품

`bash start-mac.sh`로 시작하면 이 화면을 compute server와 별도 프로세스의 `http://localhost:5173`에서 제공합니다. 1P·2P는 같은 화면 전체를 사용하는 하늘색·주황색 커서입니다. 실제 입력은 각 관람객 보정 후 유효해집니다.

같은 간단한 정적 사이트로 작품을 개발한다면 `index.html`을 교체하고 이미지·CSS·JS는 이 폴더에 넣어 `/assets/파일명`으로 연결하세요. 이 파일만 바꿔도 Pi 송신·Mac 추론·보정은 그대로 사용합니다.

React/Vite 등 별도 프론트엔드 서버를 사용할 때는 기존 실행을 Ctrl+C로 종료하고 다음처럼 시작합니다.

```bash
bash start-mac.sh --frontend-url http://localhost:5173
```

이 경우 내장 예시 프론트엔드 프로세스를 띄우지 않습니다. 작품 담당자가 자신의 서버를 시작합니다. 주소는 `exhibition/server-config.json`에 저장되어 다음 실행에도 유지됩니다. 내장 예시로 돌아가려면 `bash start-mac.sh --frontend-url ''`를 사용합니다.

외부 작품에는 관리자가 시선 구독 주소와 구독 토큰을 전달하고 두 사용자 카드에 작품 Origin을 등록합니다. 구독 코드는 [프론트엔드 매뉴얼](../docs/FRONTEND_KO.md)을 참고하세요. `/connection.json`은 이 localhost 예시 서버의 편의 기능이며, 외부 작품에 필요한 compute server 계약은 `/gaze`입니다. Pi 영상 전송 토큰은 작품에 전달하지 않습니다.
