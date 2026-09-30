"""Bootstrap check with fake git/install commands; never invokes apt or systemd."""
import os
import json
import signal
import time
from pathlib import Path
import subprocess
import tempfile
import unittest


class InstallCheck(unittest.TestCase):
    def test_two_user_launcher_starts_and_stops_both_processes(self):
        launcher = Path(__file__).resolve().parents[1] / 'scripts' / 'start-mac.sh'
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'exhibition' / 'scripts').mkdir(parents=True)
            copy = root / 'exhibition' / 'scripts' / 'start-mac.sh'
            copy.write_text(launcher.read_text())
            (root / '.venv' / 'bin').mkdir(parents=True)
            executable = root / '.venv' / 'bin' / 'python'
            executable.write_text(r"""#!/usr/bin/env python3
import json, os, sys, time
if sys.argv[1] == '-c': sys.exit(0)
with open(os.environ['EYE_LAUNCH_LOG'], 'a') as f:
    f.write(json.dumps({'pid': os.getpid(), 'args': sys.argv[1:]}) + '\n')
time.sleep(60)
""")
            executable.chmod(0o755)
            log = root / 'launch.jsonl'
            process = subprocess.Popen(['bash', str(copy), '--two-users', '--simulate'],
                                       env=dict(os.environ, EYE_LAUNCH_LOG=str(log)),
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 5
                launches = []
                while len(launches) < 2:
                    self.assertIsNone(process.poll(), 'launcher exited before starting both users')
                    self.assertLess(time.monotonic(), deadline)
                    if log.exists(): launches = [json.loads(line) for line in log.read_text().splitlines()]
                    time.sleep(.03)
                launches.sort(key=lambda item: item['args'][item['args'].index('--user-id') + 1])
                for launch, user, port, config in zip(launches, ('1', '2'), ('8080', '8081'),
                                                      ('exhibition/mac-config.json', 'exhibition/mac-user2-config.json')):
                    args = launch['args']
                    self.assertEqual(args[args.index('--user-id') + 1], user)
                    self.assertEqual(args[args.index('--port') + 1], port)
                    self.assertEqual(args[args.index('--config') + 1], config)
                    self.assertIn('--simulate', args)
            finally:
                process.send_signal(signal.SIGTERM)
                process.communicate(timeout=5)
            for launch in launches:
                with self.assertRaises(ProcessLookupError): os.kill(launch['pid'], 0)

    def test_bootstrap_preserves_existing_files(self):
        script = Path(__file__).resolve().parents[2] / 'install.sh'
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binaries = root / 'bin'
            binaries.mkdir()
            git = binaries / 'git'
            git.write_text('''#!/usr/bin/env python3
import os, sys
from pathlib import Path
args = sys.argv[1:]
mode = os.environ.get('EYE_TEST_MODE', '')
if args[0] == 'clone':
    assert args[1:4] == ['--depth', '1', '--branch'] and args[4] == 'main'
    assert args[5] == 'https://github.com/chanulee/EyeTracker-pi.git'
    dest = Path(args[-1]); (dest / 'exhibition' / 'scripts').mkdir(parents=True); (dest / '.git').mkdir()
    if mode == 'fail': sys.exit(1)
    (dest / 'exhibition' / 'scripts' / 'install-pi.sh').write_text('printf installed > "$EYE_TEST_LOG"\\n')
else:
    command = args[2:]
    if command[:1] == ['remote']: print('https://other.example/repo.git' if mode == 'wrong' else 'https://github.com/chanulee/EyeTracker-pi.git')
    elif command[:1] == ['branch']: print('main')
    elif command[:1] == ['status']: print(' M local.py' if mode == 'dirty' else '')
    elif command[:1] == ['pull']: assert command == ['pull', '--ff-only', 'origin', 'main']
    else: sys.exit(2)
''')
            git.chmod(0o755)
            identity = binaries / 'id'
            identity.write_text('#!/bin/bash\nprintf "%s\\n" "${EYE_TEST_UID:-1000}"\n')
            identity.chmod(0o755)
            destination, log = root / 'Pi install', root / 'installed'
            environment = dict(os.environ, PATH=str(binaries) + os.pathsep + os.environ['PATH'], EYE_TEST_LOG=str(log))

            def run(mode='', uid='1000'):
                return subprocess.run(['bash', str(script), str(destination)],
                                      env=dict(environment, EYE_TEST_MODE=mode, EYE_TEST_UID=uid),
                                      text=True, capture_output=True)

            result = run()
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(log.read_text(), 'installed')
            sentinel = destination / 'pi-config.json'
            sentinel.write_text('keep settings')
            self.assertEqual(run().returncode, 0)
            self.assertEqual(sentinel.read_text(), 'keep settings')
            for mode in ('dirty', 'wrong'):
                log.unlink()
                self.assertNotEqual(run(mode).returncode, 0)
                self.assertFalse(log.exists())
                self.assertEqual(sentinel.read_text(), 'keep settings')
                log.write_text('installed')
            self.assertNotEqual(run(uid='0').returncode, 0)
            # An interrupted clone must never leave a partial installation at the target.
            other = root / 'Failed install'
            result = subprocess.run(['bash', str(script), str(other)],
                                    env=dict(environment, EYE_TEST_MODE='fail'), capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(other.exists())
            occupied = root / 'existing files'
            occupied.mkdir()
            keep = occupied / 'keep.txt'
            keep.write_text('keep')
            result = subprocess.run(['bash', str(script), str(occupied)], env=environment, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(keep.read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
