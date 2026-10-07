# 8090 센서 대시보드 부팅 자동 실행

검증된 Zero 2 W의 마이크·BNO086·USB 카메라 구성을 대상으로 한다.
설치기는 이 폴더의 `install-live-dashboard.sh`다. 다른 저장소 폴더를 참조하지 않는다.
새 SD 카드의 의존성과 overlay 준비는 먼저 [README](README.md)를 따른다.

## 설치 전 상태

- 현재 SD 카드에서 세 장치가 수동 대시보드로 모두 작동해야 한다.
- `/dev/i2c-3`이 있고, SDA GPIO23 / SCL GPIO24 배선을 유지한다.
- `config.txt`의 `[all]`에 적용되는 소프트웨어 I2C, `i2smic`, `dwc2,dr_mode=host` 설정을 유지한다.
- `/home/admin/lsm6dso-venv`에 현재 작동하는 라이브러리들이 설치돼 있어야 한다.
- 직접 실행 중인 대시보드는 해당 터미널에서 `Ctrl+C`로 종료한다.

설치기는 기존 부팅 설정을 수정하지 않는다. 이미 작동하는 overlay 설정을 그대로 사용한다.
카메라 번호와 마이크 카드 번호는 서버에서 자동 탐색한다.

## 설치 방법

Mac에서 `stream` 폴더를 Pi 홈으로 복사한다. 아래 IP는 마지막 확인 주소이며 바뀌면 수정한다.
현재 터미널을 저장소의 `stream` 폴더로 이동한 상태에서 실행한다.

```bash
scp -r . admin@192.168.45.243:/home/admin/stream
```

Pi 터미널에서 실행한다. 이미 수동 서버가 있으면 먼저 Ctrl+C로 종료한다.

```bash
bash ~/stream/install-live-dashboard.sh
```

설치 중 필요한 관리 작업에만 sudo를 사용한다. Python 서버는 일반 사용자로 실행한다.

설치 후 한 번 실제 재부팅을 시험한다.

```bash
sudo reboot
```

Mac 브라우저에서 **http://eye-pi-1.local:8090** 에 접속한다.
Wi-Fi 연결과 서버 시작까지 잠시 기다린다. 첫 접속에 실패하면 새로고침한다.
기본값은 센서 읽기와 브라우저 피드 수신 모두 꺼짐이다.
**센서 읽기 켜기 → 피드 받아오기** 순서로 누른다.
`.local`을 쓰면 DHCP IP가 바뀌어도 주소를 그대로 사용할 수 있지만,
Mac과 Pi가 같은 로컬 네트워크에서 mDNS 통신을 할 수 있어야 한다.
같은 호스트명의 다른 Pi를 동시에 켜지 않는다. 이름이 충돌하면 별도 이름이 필요하다.

## 자동으로 수행하는 작업

1. 부팅 시 `eye-live-dashboard.service`를 실행한다.
2. `ExecStartPre`에서 root 권한으로 **풀업 설정 명령 하나만** 실행한다.
3. 일반 사용자 + gpio/i2c/audio/video 그룹 권한으로 Python 서버를 실행한다.
4. 8090에서 제어 화면을 제공하고, **센서 읽기 켜기** 요청 후 버스 3의 IMU, I2S 마이크, USB 카메라를 초기화한다.
5. 장치 초기화·읽기가 실패하면 기존 서버의 장치별 재시도와 watchdog을 사용한다.
6. 서버 프로세스가 종료되면 systemd가 3초 뒤 다시 실행한다. 웹의 서버 재시작 버튼도 유지된다.
7. 서비스 중지 시 자식 캡처 프로세스까지 정리한다.

네트워크 이름 광고에는 avahi-daemon을 사용하고 부팅 시 활성화한다.
설치기는 필요할 때만 해당 패키지를 설치한다.
서버가 계속 살아 있으면서 전체 HTTP 처리가 멈추는 경우를 감지하는 별도의 systemd watchdog은 추가하지 않았다.
부팅 지연·물리적 접촉 불량·Wi-Fi 단절까지 해결됐다는 의미는 아니다.

## 두 가지 피드 제어

- **센서 읽기 켜기 / 끄기**: Pi의 세 장치 수집 프로세스를 시작하거나 종료한다. 모든 브라우저에 영향을 준다. GPIO 전원 자체를 차단하지는 않는다.
- **피드 받아오기 / 수신 중지**: 현재 브라우저의 측정값·파형·영상·오디오 수신을 시작하거나 멈춘다. Pi의 수집은 계속되며 다른 브라우저에는 영향을 주지 않는다.

수신을 멈추면 화면의 이전 측정값도 지운다. 연결 상태만 1초 간격으로 확인한다.
마이크 소리를 재생하려면 수신 시작 후 기존 **듣기 시작** 버튼을 누른다.
브라우저를 새로고침하면 수신은 다시 꺼진다. Pi 수집 상태는 유지된다.
OS 부팅으로 서버가 새로 실행되면 수집도 꺼진다. 웹의 서버 재시작 버튼은 수집 상태를 유지한다.
명령행에서 `--start-sensors`를 지정하면 서버 시작과 함께 수집하는 기존 동작을 사용할 수 있다.

## 설치 파일과 서비스 충돌 방지

실행 파일 네 개는 `~/eye-live-dashboard/`에 설치한다.

- `lsm6dso_live.py`
- `imu_init.py`
- `audio_stream.py`
- `camera_device.py`

기존 `~/lsm6dso_live.py`는 덮어쓰지 않는다. 앞으로 자동 실행되는 파일은 설치 폴더 안의 파일이다.
업데이트하려면 새 배포 묶음으로 설치기를 다시 실행한다.
이미 관리되는 파일의 최초 백업은 `.before-autostart` 이름으로 보관한다.

장치 중복 점유를 막기 위해 설치돼 있는 다음 서비스는 중지·비활성화한다.

- `eye-pi.service`
- `eye-pi-dashboard.service`
- `eye-final-camera.service`
- `eye-final-sensors.service`

첫 설치 전 활성화 상태는 `~/eye-live-dashboard/previous-services.txt`에 보관한다.
설치기는 서비스 정의를 Pi의 `systemd-analyze verify`로 검사하고,
8090 포트가 다른 수동 서버에 점유돼 있으면 진행을 멈춘다.
마지막 HTTP 확인 성공은 서버 응답 확인이며 세 센서의 정상 수신 판정은 아니다.

## 상태 확인과 수동 관리

첫 부팅 확인에서 서비스 파일이 0바이트여서 `masked`로 표시되고 서버가 실행되지 않은
사례가 있었다. 빈 파일이 생성된 경위는 아직 확인되지 않았다. 설치기는 이후 생성 파일의
크기·실행 명령을 확인하고, 임시 설치 파일의 내용을 비교한 뒤 교체하도록 보강했다.
`masked`가 보이면 임의로 Python 서버를 실행하기 전에 아래로 파일 크기를 확인한다.

```bash
ls -l /etc/systemd/system/eye-live-dashboard.service
```

0바이트 파일은 정상 서비스 정의로 교체하고 `daemon-reload`, `enable --now`를 실행해야 한다.
차단 해제만으로 실행 명령이 생기지는 않는다.

```bash
systemctl status eye-live-dashboard --no-pager
```

```bash
journalctl -u eye-live-dashboard -n 80 --no-pager
```

```bash
sudo systemctl restart eye-live-dashboard
```

수동 센서 테스트를 하려면 먼저 자동 서버를 멈춘다.

```bash
sudo systemctl stop eye-live-dashboard
```

테스트 종료 후 다시 실행한다.

```bash
sudo systemctl start eye-live-dashboard
```

`stop`은 현재 실행만 멈추며 다음 부팅의 자동 실행 설정은 유지한다.

## 자동 실행 철회

```bash
sudo systemctl disable --now eye-live-dashboard
```

이후 기존 수동 실행 방법으로 돌아갈 수 있다. 설치기는 부팅 overlay 설정을 바꾸지 않았으므로
I2C·마이크·USB 설정을 원복할 필요가 없다. 기존 서비스를 다시 켜려면
`previous-services.txt`에서 원래 enabled였던 서비스만 골라 복원하고, 같은 장치의 중복 실행을 피한다.
avahi-daemon은 다른 서비스에서도 쓸 수 있으므로 자동으로 제거하지 않는다.

## 케이싱 전에 확인할 것

재부팅 후 SSH에서 서버를 직접 실행하지 않은 상태로 아래를 확인한다.

- Mac의 `.local:8090` 링크가 열림.
- **센서 읽기 켜기 → 피드 받아오기**를 누른 뒤 IMU를 움직이면 자세가 갱신됨.
- 마이크 파형과 브라우저 듣기가 작동함.
- 카메라 영상이 갱신됨.
- 한 번 더 정상 종료·전원 재연결한 뒤 같은 결과가 나옴.

가능하면 종료는 SSH의 `sudo poweroff`를 사용한다. 전원 재연결 시 자동 실행과
SD 카드 쓰기 중 전원을 끊어도 안전하다는 보장은 별개다.
