"""Public exhibition address and Mac LAN interface lookup."""
import json
import os
from pathlib import Path
import subprocess

STATE_DIR = Path(os.environ.get('EYE_STATE_DIR', Path(__file__).parent.parent / 'state'))
SETTINGS = STATE_DIR / 'server-config.json'


def server_settings():
    return json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {'frontend_url': 'http://localhost:3000', 'example_frontend': False}


def lan_address():
    # Prefer the interface used by macOS's default route; do not assume en0 is Wi-Fi.
    try:
        route = subprocess.check_output(['/sbin/route', '-n', 'get', 'default'], text=True, stderr=subprocess.DEVNULL)
        interface = next(line.split(':', 1)[1].strip() for line in route.splitlines() if 'interface:' in line)
        value = subprocess.check_output(['/usr/sbin/ipconfig', 'getifaddr', interface], text=True, stderr=subprocess.DEVNULL).strip()
        if value:
            return value
    except (OSError, subprocess.CalledProcessError, StopIteration):
        pass
    return 'Mac의LAN주소'

