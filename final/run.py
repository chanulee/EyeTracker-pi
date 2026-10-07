"""Build or run the complete Mac mini exhibition from this directory."""
import argparse
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
from urllib.request import urlopen
import webbrowser

HERE = Path(__file__).resolve().parent


def environment():
    env = dict(os.environ)
    path = HERE / '.env'
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, separator, value = line.partition('=')
            if not separator or not key.strip().replace('_', '').isalnum():
                raise ValueError(f'.env 형식을 확인하세요: {key}')
            env.setdefault(key.strip(), value.strip().strip('\"\''))
    env.setdefault('NEXT_PUBLIC_GAZE_SOURCE', 'pi')
    env.setdefault('NEXT_PUBLIC_MIC_SOURCE', 'pi')
    env.setdefault('PI_MIC_MODE', 'ondemand')
    env.setdefault('PI_SENSOR_URL_1', 'http://eye-pi-1.local:8080')
    env.update(EYE_STATE_DIR=str(HERE / 'state'), EYE_BRIDGE_PORT='5174',
               EYE_COMPUTE_AUTOSTART='0', PORT='3000', HOSTNAME='0.0.0.0', PYTHONUNBUFFERED='1')
    return env


def wait_ready(url, children, seconds=60):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        for name, child in children:
            if child.poll() is not None:
                raise RuntimeError(f'{name}가 종료되었습니다 (code {child.returncode})')
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(.1)
    raise RuntimeError(f'시작 시간 초과: {url}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', action='store_true', help='현재 .env로 작품 production 빌드')
    parser.add_argument('--dev', action='store_true', help='Next 개발 모드')
    parser.add_argument('--simulate', action='store_true', help='1P Pi의 시선·IMU·음량을 모의 입력')
    parser.add_argument('--stream', metavar='URL', help='실제 stream 대시보드 주소 (예: http://eye-pi-1.local:8090)')
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    if args.stream and args.simulate:
        parser.error('--stream과 --simulate는 함께 사용할 수 없습니다')
    if args.stream:
        from urllib.parse import urlsplit
        source = urlsplit(args.stream)
        if source.scheme != 'http' or not source.hostname or source.username or source.password or source.path not in ('', '/') or source.query or source.fragment:
            parser.error('--stream에는 http://Pi주소:8090 형식의 주소를 입력하세요')
    if sys.version_info < (3, 10):
        raise RuntimeError('Python 3.10 이상이 필요합니다')
    env = environment()
    node = shutil.which(env.get('EYE_NODE', 'node'))
    if not node:
        raise RuntimeError('Node.js 20 이상을 설치하거나 EYE_NODE에 경로를 지정하세요')
    if int(subprocess.check_output([node, '--version'], text=True).split('.')[0][1:]) < 20:
        raise RuntimeError('Node.js 20 이상이 필요합니다')
    if args.build:
        subprocess.run([node, 'node_modules/next/dist/bin/next', 'build'],
                       cwd=HERE / 'frontend', env=env, check=True)
        return
    if not args.dev and not (HERE / 'frontend/.next/BUILD_ID').exists():
        raise RuntimeError('먼저 bash final/setup-mac.sh 또는 python final/run.py --build를 실행하세요')
    ports = [3000, 5174, 8080] + ([9080] if args.simulate else []) + ([9081] if args.stream else [])
    for port in ports:
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(('0.0.0.0', port))
            except OSError:
                raise RuntimeError(f'{port} 포트가 사용 중입니다. 기존 전시 실행을 중지한 뒤 다시 시작하세요')
    from eye_tracking.common import load_config, save_config
    from eye_tracking.mac import DEFAULTS
    state = HERE / 'state'
    state.mkdir(exist_ok=True)
    save_config(state / 'server-config.json', {'frontend_url': 'http://localhost:3000', 'example_frontend': False})
    for filename in ('mac-config.json',):
        config = load_config(state / filename, DEFAULTS)
        for origin in ('http://localhost:3000', 'http://127.0.0.1:3000'):
            if origin not in config['allowed_origins']:
                config['allowed_origins'].append(origin)
        save_config(state / filename, config)
    children = []

    def launch(name, command, cwd=HERE):
        child = subprocess.Popen(command, cwd=cwd, env=env, start_new_session=True)
        children.append((name, child))

    def interrupted(signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        if args.simulate:
            for user in (1,):
                env[f'PI_SENSOR_URL_{user}'] = f'http://127.0.0.1:{9079 + user}'
                launch(f'{user}P 모의 센서', [sys.executable, 'sensors/server.py', '--mock', '--host', '127.0.0.1', '--port', str(9079 + user)])
        env['NODE_ENV'] = 'development' if args.dev else 'production'
        tracker_python = env.get('EYE_TRACKER_PYTHON', sys.executable)
        tracker_python = os.path.abspath(HERE / tracker_python)
        if not args.simulate and not Path(tracker_python).is_file():
            raise RuntimeError('EYE_TRACKER_PYTHON 실행 경로를 확인하세요')
        for user, filename in ((1, 'mac-config.json'),):
            launch(f'{user}P 시선 처리', [sys.executable if args.simulate else tracker_python, '-m', 'eye_tracking.mac', '--worker',
                '--user-id', str(user), '--port', str(8079 + user), '--config', str(state / filename)]
                + (['--simulate'] if args.simulate else []))
        launch('시선 브리지', [sys.executable, '-m', 'eye_tracking.frontend'])
        for port in (8080,):
            wait_ready(f'http://127.0.0.1:{port}/api/status', children)
        wait_ready('http://127.0.0.1:5174/', children)
        if args.stream:
            env['PI_SENSOR_URL_1'] = 'http://127.0.0.1:9081'
            launch('Pi stream 중계', [sys.executable, 'stream_bridge.py', '--url', args.stream,
                                    '--config', str(state / 'mac-config.json')])
            wait_ready('http://127.0.0.1:9081/health', children)
        if args.simulate:
            launch('모의 시선 입력', [sys.executable, 'simulate.py'])
        launch('Seoul Visual AI', [node, 'server.js'], HERE / 'frontend')
        wait_ready('http://localhost:3000/api/hardware', children)
        print('\n작품: http://localhost:3000/pre_opening\n장비 점검: http://localhost:3000/hardware\n시선 관리자: http://localhost:8080/admin')
        print('모드:', '시뮬레이션 (실제 센서·정확도 검증 아님)' if args.simulate else ('Pi stream: ' + args.stream if args.stream else 'Pi 실장비'))
        print('Ctrl+C로 작품과 모든 처리 서버를 함께 종료합니다.', flush=True)
        if not args.no_open:
            url = 'http://localhost:3000/pre_opening'
            if sys.platform == 'darwin' and Path('/Applications/Google Chrome.app').exists():
                subprocess.run(['open', '-a', 'Google Chrome', url], check=False)
            else:
                webbrowser.open(url)
        while True:
            for name, child in children:
                if child.poll() is not None:
                    raise RuntimeError(f'{name}가 종료되어 전체 실행을 중지합니다 (code {child.returncode})')
            time.sleep(.3)
    except KeyboardInterrupt:
        pass
    finally:
        for _, child in reversed(children):
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        for _, child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
