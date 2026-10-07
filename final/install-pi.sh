#!/bin/bash
# Run on each Pi as the normal SSH user. This replaces the old capture services.
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then echo '일반 사용자로 실행하세요.' >&2; exit 1; fi
final_dir="$(cd "$(dirname "$0")" && pwd)"
case "$final_dir" in *'%'*|*'"'*|*'\'*|*$'\n'*) echo '설치 경로에 %, 따옴표, 역슬래시, 줄바꿈을 사용할 수 없습니다.' >&2; exit 1 ;; esac
sudo apt-get update
sudo apt-get install -y python3-venv python3-opencv python3-numpy python3-aiohttp v4l-utils avahi-daemon
bash "$final_dir/sensors/setup.sh"
sudo usermod -aG video "$(id -un)"
cd "$final_dir"
.venv-pi/bin/python - <<'PY'
from eye_tracking.common import load_config, save_config
from eye_tracking.pi import DEFAULTS
import secrets
config = load_config('state/pi-config.json', DEFAULTS)
if not config['admin_password']:
    config['admin_password'] = secrets.token_urlsafe(24)
save_config('state/pi-config.json', config)
print('Pi 설정 사용자: admin')
print('Pi 설정 비밀번호:', config['admin_password'])
PY
unit_file="$(mktemp)"
trap 'rm -f "$unit_file"' EXIT
# Only one camera sender and one microphone reader may own each device.
for old in eye-pi.service eye-pi-dashboard.service; do
  if sudo systemctl cat "$old" >/dev/null 2>&1; then sudo systemctl disable --now "$old"; fi
done
for role in camera sensors; do
  cat > "$unit_file" <<EOF
[Unit]
Description=Seoul Visual AI Pi $role
After=network-online.target sound.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
User=$(id -un)
WorkingDirectory=$final_dir
ExecStart=/bin/bash "$final_dir/start-pi.sh" $role
Environment=PYTHONUNBUFFERED=1
Restart=always
RestartSec=3
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
  if [ "$role" = camera ]; then
    # Reuse the sender's systemd watchdog for a stalled USB driver.
    sed -i '/RestartSec=3/a WatchdogSec=30\nNotifyAccess=main' "$unit_file"
  fi
  sudo install -m 644 "$unit_file" "/etc/systemd/system/eye-final-$role.service"
done
sudo systemctl daemon-reload
sudo systemctl enable eye-final-camera.service eye-final-sensors.service
sudo systemctl restart eye-final-camera.service eye-final-sensors.service
echo "설정 화면: http://$(hostname).local:8000 · 센서 점검: http://$(hostname).local:8080"
echo '첫 설치는 sudo reboot 후 사용하세요. 각 Pi에 맞는 Mac 주소와 토큰은 8000 설정 화면에서 저장합니다.'
