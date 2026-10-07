# 현재 전시의 눈 추출 알고리즘

`Orlosky3DEyeTracker.py`는 Mac 서버가 사용자의 눈 JPEG에서 동공 타원과 3D 방향을 추출할 때 불러오는 코드입니다. 사용자별 프로세스에서 독립적으로 실행하며 전시에서는 GUI, OpenGL, gaze 파일 출력을 끕니다.

실행과 운영은 [전시 안내](../README.md), 보정과 추론 서버는 [mac.py](../mac.py)를 참고하세요. 이전 양안 트래커, OpenGL, Unity 및 SSE 데모는 [legacy/3DTracker](../../legacy/3DTracker/)로 옮겼습니다.
