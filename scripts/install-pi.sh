#!/bin/bash
set -euo pipefail
# Run as the normal SSH user; sudo is used only for packages and systemd.
if [ "$(id -u)" -eq 0 ]; then
  echo '일반 사용자로 실행하세요: bash scripts/install-pi.sh' >&2
  exit 1
fi
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$repo_dir" == *$'\n'* || "$repo_dir" == *'%'* || "$repo_dir" == *'"'* || "$repo_dir" == *'\'* ]]; then
  echo '저장소 경로에 줄바꿈, %, 따옴표, 역슬래시를 사용할 수 없습니다.' >&2
  exit 1
fi
sudo apt-get update
sudo apt-get install -y python3-venv python3-opencv python3-numpy python3-aiohttp v4l-utils avahi-daemon
python3 -m venv --system-site-packages "$repo_dir/.venv-pi"
sudo usermod -aG video "$(id -un)"
cd "$repo_dir"
"$repo_dir/.venv-pi/bin/python" - <<'PY'
from exhibition.common import load_config, save_config
from exhibition.pi import DEFAULTS
import secrets
path = 'exhibition/pi-config.json'
config = load_config(path, DEFAULTS)
if not config['admin_password']:
    config['admin_password'] = secrets.token_urlsafe(24)
    save_config(path, config)
print('Pi 설정 사용자: admin')
print('Pi 설정 비밀번호:', config['admin_password'])
PY
service_file="$(mktemp)"
trap 'rm -f "$service_file"' EXIT
cat > "$service_file" <<EOF
[Unit]
Description=Eye camera WebSocket sender and settings UI
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$(id -un)
SupplementaryGroups=video
WorkingDirectory="$repo_dir"
ExecStart="$repo_dir/.venv-pi/bin/python" -m exhibition.pi --config "$repo_dir/exhibition/pi-config.json"
Restart=on-failure
RestartSec=3
Environment=PYTHONUNBUFFERED=1
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
sudo install -m 644 "$service_file" /etc/systemd/system/eye-pi.service
sudo systemctl daemon-reload
sudo systemctl enable --now eye-pi.service
sudo systemctl restart eye-pi.service
printf '\n설정 화면: http://%s.local:8000 (Mac 브라우저에서 열기)\n' "$(hostname)"
sudo systemctl --no-pager status eye-pi.service
