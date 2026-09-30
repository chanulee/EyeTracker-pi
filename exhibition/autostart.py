"""Install and manage this user's Mac exhibition LaunchAgent."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

LABEL = 'org.eyetracker.exhibition'
ROOT = Path(__file__).resolve().parents[1]


def agent_spec(root, engine, state_dir=None):
    root = Path(root).resolve()
    launcher = 'start-pupil.sh' if engine == 'pupil' else 'start-mac.sh'
    environment = {'PYTHONUNBUFFERED': '1', 'EYE_OPEN_FRONTEND': '1'}
    if state_dir is not None:
        environment['EYE_STATE_DIR'] = str(Path(state_dir).resolve())
    return dict(Label=LABEL,
                ProgramArguments=['/usr/bin/caffeinate', '-di', '/bin/bash', str(root / launcher), '--no-open'],
                WorkingDirectory=str(root), RunAtLoad=True, KeepAlive=True, ThrottleInterval=10,
                ProcessType='Interactive', ExitTimeOut=10,
                EnvironmentVariables=environment,
                StandardOutPath=str(root / 'exhibition' / '.runtime' / 'mac.log'),
                StandardErrorPath=str(root / 'exhibition' / '.runtime' / 'mac-error.log'))


def deploy(source, destination, engine):
    """Install a local app copy outside macOS's protected Documents folder."""
    source, destination = Path(source), Path(destination)
    app = destination / 'app'
    state = destination / 'state'
    app.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    ignore = shutil.ignore_patterns('*-config.json', '*-config.tmp', '__pycache__', '.runtime', 'tests')
    shutil.copytree(source / 'exhibition', app / 'exhibition', dirs_exist_ok=True, ignore=ignore)
    for name in ('start-mac.sh', 'start-pupil.sh'):
        shutil.copy2(source / name, app / name)
    # Seed state once; reinstalling must not replace tokens or operator changes.
    for name in ('mac-config.json', 'mac-user2-config.json', 'server-config.json'):
        original, saved = source / 'exhibition' / name, state / name
        if original.exists() and not saved.exists():
            shutil.copy2(original, saved)
            saved.chmod(0o600)
    environment = '.venv-pupil' if engine == 'pupil' else '.venv'
    shutil.copytree(source / environment, app / environment, symlinks=True, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('native', 'include', '__pycache__'))
    return app, state


def launchctl(*arguments, check=True):
    return subprocess.run(['/bin/launchctl', *arguments], text=True, capture_output=True, check=check)


def manage(action, engine='pupil', root=ROOT):
    if sys.platform != 'darwin':
        raise RuntimeError('Mac에서 실행하세요. Pi는 eye-pi systemd 서비스로 자동실행합니다.')
    root = Path(root).resolve()
    target = Path.home() / 'Library' / 'LaunchAgents' / f'{LABEL}.plist'
    domain = f'gui/{os.getuid()}'
    service = domain + '/' + LABEL
    destination = Path.home() / 'Library' / 'Application Support' / 'EyeTracker-pi'
    state = launchctl('print', service, check=False)
    if action == 'status':
        print('로그인 자동실행 등록:', target.exists())
        print('현재 서비스 등록:', state.returncode == 0)
        if state.returncode == 0:
            for line in state.stdout.splitlines():
                if line.startswith('\tstate =') or line.startswith('\tpid =') or line.startswith('\tlast exit code ='):
                    print(line.strip())
        print('관리자: http://localhost:8080/admin · 작품: http://localhost:5173')
        print('설정:', destination / 'state')
        print('로그:', destination / 'app' / 'exhibition' / '.runtime')
        return
    if action == 'restart':
        launchctl('kickstart', '-k', service)
    elif action == 'start':
        if not target.exists():
            raise RuntimeError('먼저 자동실행을 설치하세요.')
        if state.returncode != 0:
            launchctl('bootstrap', domain, str(target))
    elif action in ('stop', 'remove'):
        if state.returncode == 0:
            launchctl('bootout', service)
        if action == 'remove' and target.exists():
            target.unlink()
    elif action == 'install':
        python = root / ('.venv-pupil' if engine == 'pupil' else '.venv') / 'bin' / 'python'
        if not python.is_file():
            raise RuntimeError(f'실행 환경이 없습니다: {python}')
        imports = 'import aiohttp,cv2,numpy' + ('; import pye3d' if engine == 'pupil' else '')
        subprocess.run([str(python), '-c', imports], check=True, capture_output=True)
        if state.returncode == 0:
            launchctl('bootout', service)
        app, state_dir = deploy(root, destination, engine)
        installed_python = app / ('.venv-pupil' if engine == 'pupil' else '.venv') / 'bin' / 'python'
        subprocess.run([str(installed_python), '-c', imports], check=True, capture_output=True, cwd=app)
        logs = app / 'exhibition' / '.runtime'
        logs.mkdir(parents=True, exist_ok=True, mode=0o700)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix('.tmp')
        temporary.write_bytes(plistlib.dumps(agent_spec(app, engine, state_dir)))
        temporary.chmod(0o600)
        temporary.replace(target)
        launchctl('enable', service)
        launchctl('bootstrap', domain, str(target))
        print('로그인 자동실행을 등록했습니다:', target)
        print('Mac 로그인 후 서버와 작품 페이지가 시작되고, 실행 중에는 화면·시스템의 유휴 잠자기를 막습니다.')
    print('완료:', action)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', nargs='?', default='install', choices=['install', 'status', 'start', 'stop', 'restart', 'remove'])
    parser.add_argument('--engine', choices=['pupil', 'orlosky'], default='pupil')
    args = parser.parse_args()
    try:
        manage(args.action, args.engine)
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        detail = error.stderr if isinstance(error, subprocess.CalledProcessError) else str(error)
        raise SystemExit(f'자동실행 {args.action} 실패: {detail}')


if __name__ == '__main__':
    main()
