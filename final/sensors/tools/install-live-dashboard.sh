#!/usr/bin/env bash
# Run as the normal Pi user. Installs the tested 8090 dashboard, not final/install-pi.sh.
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then
  echo 'sudo 없이 일반 SSH 사용자로 실행하세요. 필요한 작업만 sudo를 사용합니다.' >&2
  exit 1
fi
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install_dir="$HOME/eye-live-dashboard"
python_bin="$HOME/lsm6dso-venv/bin/python"
unit_name=eye-live-dashboard.service
unit_dir="$(mktemp -d)"
unit_tmp="$unit_dir/$unit_name"
trap 'rm -rf "$unit_dir"' EXIT

case "$install_dir $python_bin" in
  *'%'*|*'"'*|*'\'*|*$'\n'*) echo '설치 경로에 %, 따옴표, 역슬래시, 줄바꿈을 사용할 수 없습니다.' >&2; exit 1 ;;
esac
test -x "$python_bin" || { echo "기존 Python 환경이 없습니다: $python_bin" >&2; exit 1; }
test -e /dev/i2c-3 || { echo '/dev/i2c-3이 없습니다. 검증된 i2c-gpio 부팅 설정을 먼저 적용하세요.' >&2; exit 1; }
pinctrl_bin="$(command -v pinctrl)"
for group in gpio i2c audio video; do
  getent group "$group" >/dev/null || { echo "필수 그룹 없음: $group" >&2; exit 1; }
done
"$python_bin" - <<'PY'
import importlib.util
modules = ('board', 'busio', 'adafruit_extended_bus', 'adafruit_bno08x', 'qwiic_lsm6dso', 'cv2')
missing = [name for name in modules if importlib.util.find_spec(name) is None]
if missing:
    raise SystemExit('기존 가상환경에서 모듈을 찾지 못했습니다: ' + ', '.join(missing))
PY

# Accept the packaged files beside this installer or the existing repository layout.
sources=("$script_dir/lsm6dso_live.py")
for relative in imu_init.py audio_stream.py; do
  if [ -f "$script_dir/$relative" ]; then sources+=("$script_dir/$relative");
  else sources+=("$script_dir/../$relative"); fi
done
if [ -f "$script_dir/camera_device.py" ]; then sources+=("$script_dir/camera_device.py");
else sources+=("$script_dir/../../eye_tracking/camera_device.py"); fi
for source_file in "${sources[@]}"; do
  test -f "$source_file" || { echo "배포 파일 없음: $source_file" >&2; exit 1; }
done

sudo -v
if ! systemctl cat avahi-daemon.service >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y avahi-daemon
fi
mkdir -p "$install_dir"
# Record the old enablement states only on the first installation.
if [ ! -f "$install_dir/previous-services.txt" ]; then
  for old in eye-pi.service eye-pi-dashboard.service eye-final-camera.service eye-final-sensors.service; do
    status="$(systemctl is-enabled "$old" 2>/dev/null || true)"
    printf '%s %s\n' "$old" "$status"
  done > "$install_dir/previous-services.txt"
fi
for source_file in "${sources[@]}"; do
  destination="$install_dir/$(basename "$source_file")"
  if [ -f "$destination" ]; then cp -n "$destination" "$destination.before-autostart"; fi
  install -m 644 "$source_file" "$destination"
done

cat > "$unit_tmp" <<EOF
[Unit]
Description=Eye Pi microphone IMU USB camera dashboard (8090)
Wants=network-online.target avahi-daemon.service
After=network-online.target sound.target avahi-daemon.service
StartLimitIntervalSec=0

[Service]
Type=simple
User=$(id -un)
SupplementaryGroups=gpio i2c audio video
WorkingDirectory=$install_dir
Environment=PYTHONUNBUFFERED=1
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStartPre=+$pinctrl_bin set 23,24 pu
ExecStart="$python_bin" "$install_dir/lsm6dso_live.py" --i2c-bus=3 --port=8090
Restart=always
RestartSec=3
KillMode=control-group
TimeoutStopSec=10
UMask=0022

[Install]
WantedBy=multi-user.target
EOF

test -s "$unit_tmp" || { echo '서비스 정의 파일이 비어 있습니다. 설치를 중단합니다.' >&2; exit 1; }
grep -q '^ExecStart=' "$unit_tmp" || { echo '서비스 실행 명령이 없습니다.' >&2; exit 1; }
# Validate before disabling the currently configured services.
if command -v systemd-analyze >/dev/null; then
  systemd-analyze verify "$unit_tmp"
fi
for old in eye-pi.service eye-pi-dashboard.service eye-final-camera.service eye-final-sensors.service; do
  if systemctl cat "$old" >/dev/null 2>&1; then sudo systemctl disable --now "$old"; fi
done
if systemctl cat "$unit_name" >/dev/null 2>&1; then sudo systemctl stop "$unit_name"; fi
"$python_bin" - <<'PY'
import socket
with socket.socket() as listener:
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        listener.bind(('0.0.0.0', 8090))
    except OSError as exc:
        raise SystemExit('8090 포트 사용 중. 직접 실행한 대시보드를 Ctrl+C로 종료 후 설치기를 다시 실행하세요. ' + str(exc))
PY
if [ -f "/etc/systemd/system/$unit_name" ]; then
  sudo cp -n "/etc/systemd/system/$unit_name" "/etc/systemd/system/$unit_name.before-autostart"
fi
sudo install -m 644 "$unit_tmp" "/etc/systemd/system/$unit_name.installing"
sudo cmp "$unit_tmp" "/etc/systemd/system/$unit_name.installing"
sudo test -s "/etc/systemd/system/$unit_name.installing"
sudo mv -f "/etc/systemd/system/$unit_name.installing" "/etc/systemd/system/$unit_name"
sudo cmp "$unit_tmp" "/etc/systemd/system/$unit_name"
sudo systemctl daemon-reload
sudo systemctl enable --now avahi-daemon.service
sudo systemctl enable "$unit_name"
test "$(systemctl is-enabled "$unit_name")" = enabled
sudo systemctl restart "$unit_name"

# Success means a live HTTP endpoint, not yet that all three hardware workers are ready.
"$python_bin" - <<'PY'
import time
import urllib.request
for _ in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8090/', timeout=2) as response:
            if response.status == 200:
                print('대시보드 HTTP 응답 확인 완료. 각 센서 준비 상태는 웹 화면에서 확인하세요.')
                break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit('서버 응답 없음: journalctl -u eye-live-dashboard -n 60 --no-pager 로 확인하세요.')
PY
echo "자동 실행 설치 완료: http://$(hostname).local:8090"
echo '다음은 sudo reboot로 실제 부팅 후 IMU·마이크·카메라를 확인하세요.'
