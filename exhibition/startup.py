"""Public startup information for the Mac compute server's two private workers."""
import json
import os
from pathlib import Path
import socket
import subprocess
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen
import webbrowser

from .common import load_config, save_config

STATE_DIR = Path(os.environ.get('EYE_STATE_DIR', Path(__file__).parent))
SETTINGS = STATE_DIR / 'server-config.json'
ADMIN = 'http://localhost:8080/admin'


def server_settings():
    # Reading a management page should not create a file.
    return json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {'frontend_url': 'http://localhost:5173', 'example_frontend': True}


def validate_frontend(value):
    parsed = urlsplit(value)
    if value and (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username
                  or parsed.password or '\n' in value or '\r' in value):
        raise ValueError('작품 주소는 http://localhost:5173처럼 입력하세요')
    _ = parsed.port
    return value


def prepare():
    for port in (8080, 8081):
        with socket.socket() as probe:
            probe.settimeout(.3)
            if probe.connect_ex(('127.0.0.1', port)) == 0:
                raise SystemExit(f'{port} 포트의 서버가 이미 켜져 있어요. {ADMIN}을 열거나 기존 서버를 Ctrl+C로 종료하세요.')
    if 'EYE_FRONTEND_URL' in os.environ:
        value = validate_frontend(os.environ['EYE_FRONTEND_URL'])
        config = load_config(SETTINGS, {'frontend_url': ''})
        config['frontend_url'] = value
        config['example_frontend'] = not value
        if not value:
            config['frontend_url'] = 'http://localhost:5173'
        save_config(SETTINGS, config)
    config = server_settings()
    if config.get('example_frontend', False):
        with socket.socket() as probe:
            probe.settimeout(.3)
            if probe.connect_ex(('127.0.0.1', 5173)) == 0:
                raise SystemExit('예시 작품의 5173 포트가 사용 중입니다. 기존 작품을 연결하려면 --frontend-url 주소를 지정하세요.')
        from .mac import DEFAULTS
        for filename in ('mac-config.json', 'mac-user2-config.json'):
            path = STATE_DIR / filename
            worker = load_config(path, DEFAULTS)
            if 'http://localhost:5173' not in worker['allowed_origins']:
                worker['allowed_origins'].append('http://localhost:5173')
                save_config(path, worker)


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


def announce():
    deadline = time.monotonic() + 15
    states = []
    ready = False
    while time.monotonic() < deadline:
        try:
            states = []
            for user, port in ((1, 8080), (2, 8081)):
                with urlopen(f'http://localhost:{port}/api/status', timeout=1) as response:
                    status = json.load(response)
                if status.get('user_id') != user:
                    raise ValueError('사용자 번호가 다른 서버가 실행 중입니다')
                states.append(status)
            if server_settings().get('example_frontend', False):
                with urlopen('http://localhost:5173/connection.json', timeout=1) as response:
                    if len(json.load(response).get('players', [])) != 2:
                        raise ValueError('예시 작품 구독 설정 준비 실패')
            ready = True
            break
        except (OSError, URLError, ValueError):
            time.sleep(.1)
    if not ready:
        raise SystemExit('Compute server 시작 실패. 위 오류와 8080/8081 포트를 확인하세요.')
    lan = lan_address()
    frontend = server_settings().get('frontend_url', '')
    print('\nEyeTracker · Mac mini compute server 준비 완료', flush=True)
    print('Pi SW → Mac mini compute server → 별도 작품 프론트엔드\n')
    if states[0]['simulate']:
        print('모드: 시뮬레이션 (실제 Pi 연결을 받지 않음)')
    for state, port in zip(states, (8080, 8081)):
        user = state['user_id']
        connection = '연결됨' if state['camera_connected'] else '연결 대기'
        print(f'{user}P Pi: {connection} · ws://{lan}:{port}/camera')
    print(f'\n통합 관리자: {ADMIN}')
    print('Pi 영상 전송 토큰 / 작품 시선 구독 토큰 / 보정 / 연결 상태는 관리자에서 확인하세요.')
    print('\n작품 프론트엔드:', frontend or '주소 미등록 (별도 개발·실행 필요)')
    if server_settings().get('example_frontend', False):
        print('예시 작품 실행 중 · 교체할 화면: exhibition/frontend-example/index.html')
    print('1P 시선 구독: ws://localhost:8080/gaze')
    print('2P 시선 구독: ws://localhost:8081/gaze')
    print('두 커서 확인 화면: http://localhost:8080/stage (연결 확인용)')
    if not frontend:
        print('작품 주소 등록: bash start-mac.sh --frontend-url http://localhost:5173')
    print('작품 Origin은 관리자에서 1P·2P 모두 등록하세요.')
    print('\nCtrl+C로 compute server 전체 종료\n', flush=True)
    if os.environ.get('EYE_OPEN_ADMIN', '1') == '1':
        try:
            if not webbrowser.open(ADMIN):
                print('브라우저를 자동으로 열지 못했어요. 위 관리자 링크를 직접 여세요.', flush=True)
        except webbrowser.Error:
            print('위 관리자 링크를 브라우저에서 여세요.', flush=True)
    if os.environ.get('EYE_OPEN_FRONTEND') == '1' and frontend:
        try:
            webbrowser.open(frontend)
        except webbrowser.Error:
            print('위 작품 링크를 브라우저에서 여세요.', flush=True)
