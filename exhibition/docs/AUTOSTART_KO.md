# 전시 자동실행과 USB 복구

## 현재 적용 상태

Mac 로그인 서비스 설치와 8080/8081/5173 실행을 확인했습니다. 실제 Pi 1의 영상 재연결도 확인했습니다. Mac 재부팅 자체는 작업 중인 앱에 영향을 주므로 실시하지 않았습니다. Pi 복구 코드는 GitHub main에 올라간 뒤 Pi를 업데이트해야 적용됩니다. Pi의 실제 USB 이탈·장시간 운용 검증은 별도입니다.

## 전원 켜기

Pi는 `eye-pi.service`가 부팅 시 시작됩니다. 저장된 Wi-Fi·Mac 수신 주소·Pi 영상 전송 토큰을 재사용합니다. Mac이 늦게 시작돼도 자동 재접속합니다. 같은 네트워크와 USB 연결은 필요하며 새로운 Wi-Fi 비밀번호를 자동으로 알아내지는 않습니다.

Mac은 사용자 로그인 후 `org.eyetracker.exhibition` LaunchAgent가 Pupil 서버 두 개와 예시 작품을 실행합니다. 준비 후 기본 브라우저에 작품을 엽니다. 실행 중 `caffeinate -di`로 화면·시스템의 유휴 잠자기를 억제합니다. 로그인 화면이나 FileVault 해제를 자동화하지 않습니다. 재연결/재시작 후 관람객 보정은 다시 진행합니다.

## Mac 설치와 갱신

```bash
cd ~/Documents/GitHub/EyeTracker-pi
bash setup-autostart-mac.sh install
bash setup-autostart-mac.sh status
```

기존 수동 서버가 켜져 있으면 먼저 Ctrl+C로 종료합니다. `install`은 Pupil 환경을 확인하고 실행본을 `~/Library/Application Support/EyeTracker-pi/app/`에 설치합니다. macOS 로그인 서비스는 Documents의 저장소를 직접 읽지 못할 수 있어 전용 실행 위치를 사용합니다. 최초 설치 때 설정을 `state/`에 복사하며 재설치 때 기존 운영 설정을 유지합니다. 사용자별 토큰·Origin·작품 주소는 관리자에서 변경하세요. 저장소의 설정 파일은 최초 설치의 원본이며 이후 실제 운영 설정은 state에 있습니다. 로그는 `app/exhibition/.runtime/mac.log`, `mac-error.log`입니다.

저장소를 pull하거나 코드를 수정한 뒤 `install`을 다시 실행하면 새 코드/실행 환경을 복사하고 서비스를 갱신합니다. 기본 Pupil 엔진 대신 기존 엔진을 쓰려면 `install --engine orlosky`를 지정합니다. 설치본 Python은 현재 Mac의 Codex 제공 Python 런타임을 기반으로 하므로 해당 런타임이 삭제되면 환경을 재설치해야 합니다.

```bash
bash setup-autostart-mac.sh restart
bash setup-autostart-mac.sh stop
bash setup-autostart-mac.sh start
# 로그인 자동실행 해제; 운영 설정/실행본은 보존
bash setup-autostart-mac.sh remove
```

`stop`은 이번 로그인 세션에서만 중지합니다. 설정 파일을 보존하므로 다음 로그인에 다시 시작합니다. `remove`는 LaunchAgent 등록 파일도 제거합니다. 자동 서비스가 켜진 동안 `start-pupil.sh`/`start-mac.sh`를 동시에 실행하면 포트 충돌로 수동 시작이 중단됩니다.

## Pi 업데이트

아래 명령은 Pi SSH 터미널에서 실행합니다. 이번 변경을 GitHub main에 올린 후 실행해야 합니다. 스크립트가 없는 이전 checkout에서도 사용할 수 있습니다.

```bash
curl -fsSL https://raw.githubusercontent.com/chanulee/EyeTracker-pi/main/install.sh -o /tmp/eye-install.sh
bash /tmp/eye-install.sh
sudo systemctl is-enabled eye-pi
sudo systemctl status eye-pi --no-pager
```

설치 스크립트가 서비스 자동실행, 실패 재시작, 카메라 watchdog 설정을 갱신합니다. 서비스 재시작 시 Pi 영상 연결과 Mac 보정은 초기화되며 토큰·UI 비밀번호는 유지합니다.

## 카메라 설정 저장

Pi UI에서 카메라 선택 **USB 눈 카메라 자동 검색**, 전송 방식 **카메라 MJPEG 우선**을 사용합니다. 자동 모드는 단일 UVC 영상 캡처 노드를 선택하며 metadata와 Pi 내부 codec/ISP를 제외합니다. by-id 또는 by-path의 안정된 링크를 우선 사용합니다. 재연결 시 같은 장치 식별자를 다시 찾으므로 video0이 video2로 바뀌어도 복구할 수 있습니다. 카메라가 여러 대면 자동 모드에서 지정 번호를 우선하거나 수동 모드로 번호를 선택하세요.

송출 최대 FPS·JPEG 품질만 바꿔 저장하면 카메라를 닫거나 Mac 세션을 끊지 않습니다. 카메라는 열 때 30 FPS를 요청하며 실제 속도는 지원 모드·노출·네트워크·Mac 처리 속도에 따라 달라집니다. FPS는 송출 상한입니다. 품질은 Pi 인코딩 모드에만 적용되며 camera-mjpeg 직송에서는 카메라의 JPEG를 그대로 보냅니다. 카메라 선택·해상도·회전·전송 방식 변경은 카메라를 다시 열고 Mac 보정을 초기화합니다. 주소·토큰 변경은 Mac 연결만 다시 맺습니다.

## 끊겼을 때

Pi는 실패한 캡처를 해제하고 2초마다 USB 장치를 재검색합니다. USB 오류 때문에 MJPEG가 미지원이라고 고정하지 않고 복구 후 다시 직송을 시도합니다. 드라이버 호출이 15초 이상 멈추면 systemd heartbeat를 보내지 않고 30초 watchdog 만료 시 송신 프로세스를 재시작합니다. 카메라가 사라졌을 때는 Mac 영상 세션을 끊어 이전 보정을 폐기합니다. 카메라가 돌아오면 자동 송출하고 다시 보정합니다.

상태의 `camera_device`, `camera_node`, `camera_state`, `camera_retry_count`, `camera_recoveries`로 현재 장치와 복구 여부를 확인합니다. 이 재시작은 Python 송신기를 대상으로 하며 Pi 전체 전원을 자동으로 껐다 켜지는 않습니다. USB 컨트롤러 자체가 응답하지 않거나 OTG·전원 문제가 지속되면 자동 재검색만으로 해결하지 못할 수 있습니다. 이번 장애의 원인은 저장 시점의 로그 없이는 확정할 수 없습니다.

```bash
# Pi IP 확인
hostname -I
# USB 장치와 현재 캡처 노드
lsusb
ls -l /dev/v4l/by-id/ /dev/video*
# 현재/이전 부팅의 커널 로그 (이전 로그는 보존됐을 때만 가능)
sudo journalctl -k -b --no-pager
sudo journalctl -k -b -1 --no-pager
# 송신기만 재시작
sudo systemctl restart eye-pi
```

## 구현 근거

장치 구분은 [Linux VIDIOC_QUERYCAP](https://docs.kernel.org/userspace-api/media/v4l/vidioc-querycap.html)의 장치별 캡처 capability를 확인합니다. Mac은 [Apple LaunchAgent 안내](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)의 사용자 로그인 서비스로 등록합니다.
