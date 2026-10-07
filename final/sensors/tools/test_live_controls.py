"""Run: python3 final/sensors/tools/test_live_controls.py (no hardware required)."""
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from unittest.mock import patch

import lsm6dso_live as live


def blocked_worker(kind, stop, pipe, options):
    os.setsid()
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    pipe.send(('state', dict(ready=False, stage='starting', error='blocked test driver')))
    while True:
        time.sleep(1)  # Deliberately ignore the stop request like a hung driver.


def wait_for(callback, timeout=10):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        try:
            result = callback()
            if result:
                return result
        except (URLError, OSError):
            pass
        time.sleep(.05)
    raise AssertionError('Timed out waiting for recovery')


class ControlsTest(unittest.TestCase):
    def test_blocked_worker_can_be_replaced_and_cleaned_up(self):
        states = []
        group = live.LiveDevices({}, ['imu'], {'imu': states.append}, {})
        with patch.object(live, 'device_worker', blocked_worker):
            group.thread.start()
            try:
                wait_for(lambda: states and states[-1].get('error') == 'blocked test driver')
                old = group.workers['imu'][0]
                old_pid = old.pid
                self.assertTrue(group.request('imu'))
                wait_for(lambda: group.snapshot()['devices']['imu']['generation'] == 2
                         and group.workers.get('imu') and group.workers['imu'][0] is not old
                         and states[-1].get('generation') == 2_000_000)
                self.assertNotEqual(group.workers['imu'][0].pid, old_pid)
                with self.assertRaises(ProcessLookupError):
                    os.kill(old_pid, 0)
                # Also exercise the automatic watchdog, without waiting 25 seconds.
                group.workers['imu'][3] = time.monotonic()-30
                wait_for(lambda: group.snapshot()['devices']['imu']['generation'] >= 3)
            finally:
                group.close()
        self.assertFalse(group.thread.is_alive())
        self.assertFalse(group.workers)

    def test_http_controls_and_real_server_restart(self):
        with socket.socket() as reserve:
            reserve.bind(('127.0.0.1', 0))
            port = reserve.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        process = subprocess.Popen([sys.executable, str(Path(live.__file__)),
                                    '--mock', '--no-camera', '--port', str(port)],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        def state():
            return json.load(urlopen(base+'/state', timeout=1))
        def post(action, origin=None):
            headers = {'Content-Type': 'application/json'}
            if origin:
                headers['Origin'] = origin
            with urlopen(Request(base+'/control/'+action, data=b'{}', headers=headers), timeout=3) as r:
                self.assertEqual(r.status, 202)
        try:
            parked = wait_for(lambda: (s if not (s := state())['connections']['busy'] else None))
            self.assertFalse(parked['connections']['capture_enabled'])
            self.assertEqual(parked['connections']['devices']['imu']['generation'], 0)
            self.assertEqual(parked['connections']['devices']['mic']['phase'], 'paused')
            with urlopen(base+'/status', timeout=2) as response:
                summary = json.load(response)
            self.assertEqual(set(summary), {'boot_id', 'connections'})
            with self.assertRaises(HTTPError) as unavailable:
                urlopen(base+'/audio', timeout=2)
            self.assertEqual(unavailable.exception.code, 503)
            post('capture-on', base)
            initial = wait_for(lambda: (s if (s := state()).get('mic', {}).get('ready')
                                       and not s.get('error') else None))
            generations = {k: v['generation'] for k, v in initial['connections']['devices'].items()}
            with self.assertRaises(HTTPError) as rejected:
                post('imu', 'https://unrelated.example')
            self.assertEqual(rejected.exception.code, 403)
            with self.assertRaises(HTTPError) as disabled:
                post('camera')
            self.assertEqual(disabled.exception.code, 400)
            post('imu', base)
            reset = wait_for(lambda: (s if (s := state())['connections']['devices']['imu']['generation']
                                     > generations['imu'] and not s.get('error') else None))
            self.assertEqual(reset['connections']['devices']['mic']['generation'], generations['mic'])
            self.assertTrue(reset['mic']['ready'])
            post('all', base)
            wait_for(lambda: (s := state())['connections']['devices']['mic']['generation'] > generations['mic']
                     and not s['connections']['busy'])
            before_cycle = state()['connections']['devices']['mic']['generation']
            post('imu-cycle', base)
            wait_for(lambda: state()['connections']['imu_mode'] == 'LSM6DSO')
            switched = wait_for(lambda: (s if (s := state())['connections']['imu_mode'] == 'BNO086'
                                        and not s['connections']['busy'] and not s.get('error') else None))
            self.assertEqual(switched['sensor'], 'BNO086')
            self.assertEqual(switched['connections']['devices']['mic']['generation'], before_cycle)
            post('server', base)
            restarted = wait_for(lambda: (s if (s := state())['boot_id'] != initial['boot_id']
                                         and s['mic']['ready'] and not s.get('error') else None), 15)
            self.assertNotEqual(restarted['boot_id'], initial['boot_id'])
            self.assertEqual(restarted['connections']['imu_mode'], 'BNO086')
            self.assertIsNone(process.poll())
            before_pause = restarted['connections']['devices']['imu']['generation']
            post('capture-off', base)
            paused = wait_for(lambda: (s if not (s := state())['connections']['busy']
                                      and not s['connections']['capture_enabled'] else None))
            self.assertFalse(paused['mic']['ready'])
            self.assertNotIn('quaternion', paused)
            self.assertEqual(paused['connections']['devices']['imu']['phase'], 'paused')
            time.sleep(.3)
            self.assertEqual(state()['connections']['devices']['imu']['generation'], before_pause)
            post('server', base)
            asleep = wait_for(lambda: (s if (s := state())['boot_id'] != restarted['boot_id'] else None), 15)
            self.assertFalse(asleep['connections']['capture_enabled'])
            self.assertEqual(asleep['connections']['devices']['imu']['generation'], 0)
            post('capture-on', base)
            resumed = wait_for(lambda: (s if (s := state()).get('mic', {}).get('ready')
                                        and not s.get('error') else None))
            sampled = resumed['sampled_at']
            time.sleep(.3)
            # Browser control-only requests do not stop acquisition on the Pi.
            with urlopen(base+'/status', timeout=2) as response:
                self.assertNotIn('mic', json.load(response))
            self.assertGreater(state()['sampled_at'], sampled)
        finally:
            process.send_signal(signal.SIGINT)
            try:
                _, errors = process.communicate(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                _, errors = process.communicate()
            self.assertNotIn(b'Traceback', errors)


if __name__ == '__main__':
    unittest.main()
