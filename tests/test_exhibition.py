"""Run: .venv/bin/python -m unittest discover -s tests -v"""
import asyncio
import base64
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

import aiohttp
from aiohttp.test_utils import TestClient, TestServer
import cv2
import numpy as np

from exhibition.common import load_config, save_config
from exhibition.gaze import POINTS, Stabilizer, fit_calibration, predict
from exhibition.mac import create_app, load_tracker, RUNTIME_KEY
from exhibition.pi import create_app as pi_app, DEFAULTS as PI_DEFAULTS, validate


class MathCheck(unittest.TestCase):
    def test_calibration_and_filter(self):
        inputs = [[(x - .5) * .8, (.5 - y) * .8] for x, y in POINTS]
        model = fit_calibration(inputs, POINTS)
        np.testing.assert_allclose(predict(model, [.16, .08]), [.7, .4], atol=1e-6)
        for bad in [np.zeros((9, 2)), [[x, x] for x, _ in inputs]]:
            with self.assertRaises(ValueError):
                fit_calibration(bad, POINTS)
        smoother = Stabilizer()
        self.assertEqual(smoother.update([.5, .5], 1), [.5, .5])
        smoother.update([.51, .5], 1.04)
        spike = smoother.update([1, 1], 1.08)
        self.assertLess(spike[0], .53)
        self.assertEqual(smoother.update([0, 0], 2), [0, 0])
        self.assertIsNone(smoother.update([float('nan'), 0], 2.1))
        with self.assertRaises(ValueError):
            validate({'fps': 0})
        with self.assertRaises(ValueError):
            validate({'receiver': 'file:///etc/passwd'})
        with self.assertRaises(ValueError):
            validate({'flip': 'false'})

    def test_real_tracker_headless_video(self):
        tracker = load_tracker()
        tracker.reset_tracking_state()
        capture = cv2.VideoCapture(str(Path(__file__).resolve().parents[1] / 'assets' / 'eye_test.mp4'))
        count = 0
        try:
            # GUI and legacy file output must not be needed for the production path.
            with patch.object(cv2, 'imshow', side_effect=AssertionError('GUI used')):
                for _ in range(12):
                    ok, frame = capture.read()
                    self.assertTrue(ok)
                    tracker.process_frame(frame)
                    result = tracker.get_last_tracking_result()
                    if result and result.get('direction'):
                        count += 1
                        self.assertGreater(result['confidence'], .65)
                        self.assertTrue(np.isfinite(result['direction']).all())
                        self.assertAlmostEqual(np.linalg.norm(result['direction']), 1)
            self.assertGreater(count, 0)
            blank = np.full((480, 640, 3), 255, np.uint8)
            tracker.process_frame(blank)
            self.assertIsNone(tracker.get_last_tracking_result())
        finally:
            capture.release()


class NetworkCheck(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config_path = Path(self.tmp.name) / 'mac.json'
        self.app = create_app(self.config_path, simulate=True)
        self.runtime = self.app[RUNTIME_KEY]
        self.client = TestClient(TestServer(self.app))
        await self.client.start_server()
        self.origin = str(self.client.make_url('')).rstrip('/')

    async def asyncTearDown(self):
        await self.client.close()
        self.tmp.cleanup()

    async def post(self, path, data):
        return await self.client.post(path, json=data, headers={'Origin': self.origin})

    async def test_calibration_and_stale_ws(self):
        ws = await self.client.ws_connect('/gaze', headers={'Origin': self.origin})
        self.assertFalse((await ws.receive_json())['valid'])
        await self.post('/api/demo', {'x': .5, 'y': .5})
        begin = await self.post('/api/calibration', {'action': 'begin'})
        session = (await begin.json())['session_id']

        async def feed(x, y, stop):
            while not stop.is_set():
                await self.post('/api/demo', {'x': x, 'y': y})
                await asyncio.sleep(.025)

        for i, (x, y) in enumerate(POINTS + [( .5, .5)]):
            stop = asyncio.Event()
            task = asyncio.create_task(feed(x, y, stop))
            response = await self.post('/api/calibration', dict(action='sample' if i < 9 else 'validate',
                                                               index=i, session_id=session))
            stop.set()
            await task
            self.assertEqual(response.status, 200, await response.text())
        await self.post('/api/demo', {'x': .7, 'y': .4})
        self.assertTrue(self.runtime.packet()['valid'])
        self.assertAlmostEqual(self.runtime.packet()['x'], .7, delta=.02)
        self.runtime.received = time.monotonic() - 1
        packet = self.runtime.packet()
        self.assertFalse(packet['valid'])
        self.assertIsNone(packet['x'])
        self.assertIsNone(packet['direction'])
        self.assertFalse(packet['tracking'])
        await self.post('/api/calibration', {'action': 'reset'})
        self.assertFalse(self.runtime.packet()['calibrated'])
        self.assertNotEqual(session, self.runtime.session)
        await ws.close()

    async def test_authorization_validation_and_config(self):
        with self.assertRaises(aiohttp.WSServerHandshakeError):
            await self.client.ws_connect('/gaze', headers={'Origin': 'http://untrusted.example'})
        self.assertEqual((await self.client.post('/api/config', json={'smoothing_ms': 100})).status, 403)
        self.assertEqual((await self.post('/api/config', {'smoothing_ms': 0})).status, 400)
        self.assertEqual((await self.post('/api/config', {'allowed_origins': ['http://localhost:5173/']})).status, 400)
        self.assertEqual((await self.post('/api/config', {'allowed_origins': ['http://localhost:5173']})).status, 200)
        ws = await self.client.ws_connect('/gaze', headers={'Origin': 'http://localhost:5173'})
        self.assertEqual((await ws.receive_json())['version'], 1)
        await ws.close()
        self.assertEqual((await self.client.get('/api/config', headers={'Host': 'evil.example'})).status, 403)
        persisted = load_config(self.config_path, {})
        self.assertEqual(persisted['allowed_origins'], ['http://localhost:5173'])
        self.assertEqual(self.config_path.stat().st_mode & 0o777, 0o600)
        self.assertEqual((await self.post('/api/calibration', {'action': 'begin'})).status, 400)
        self.assertEqual((await self.post('/api/demo', {'x': float('nan'), 'y': 0})).status, 400)

    async def test_subscription_token_and_local_dashboard(self):
        self.assertEqual((await self.client.get('/admin')).status, 200)
        self.assertEqual((await self.client.get('/admin', headers={'Host': 'evil.example'})).status, 403)
        ws = await self.client.ws_connect('/gaze', headers={'Origin': self.origin})
        await ws.receive_json()
        self.assertEqual((await self.post('/api/config', {'require_gaze_token': True})).status, 200)
        self.assertEqual((await ws.receive()).type, aiohttp.WSMsgType.CLOSE)
        await ws.close()
        for token in ('', self.runtime.config['token']):
            with self.assertRaises(aiohttp.WSServerHandshakeError) as error:
                await self.client.ws_connect('/gaze', params={'token': token}, headers={'Origin': self.origin})
            self.assertEqual(error.exception.status, 401)
        ws = await self.client.ws_connect('/gaze', params={'token': self.runtime.config['gaze_token']},
                                          headers={'Origin': self.origin})
        await ws.receive_json()
        status = await (await self.client.get('/api/status')).json()
        self.assertEqual(status['subscribers'], 1)
        await ws.close()

    async def test_dashboard_peer_proxy_and_player_isolation(self):
        peer = TestClient(TestServer(create_app(Path(self.tmp.name) / 'peer.json', simulate=True, user_id=2)))
        await peer.start_server()
        dashboard = TestClient(TestServer(create_app(Path(self.tmp.name) / 'dashboard.json', simulate=True,
                                                     peer_port=peer.server.port)))
        await dashboard.start_server()
        origin = str(dashboard.make_url('')).rstrip('/')
        try:
            peer_runtime = peer.app[RUNTIME_KEY]
            status = await (await dashboard.get('/api/player2/status')).json()
            self.assertEqual(status['user_id'], 2)
            config = await (await dashboard.get('/api/player2/config')).json()
            self.assertEqual(config['gaze_token'], peer_runtime.config['gaze_token'])
            before = dashboard.app[RUNTIME_KEY].session
            peer_before = peer_runtime.session
            response = await dashboard.post('/api/player2/calibration', json={'action': 'reset'},
                                             headers={'Origin': origin})
            self.assertEqual(response.status, 200)
            self.assertNotEqual(peer_before, peer_runtime.session)
            self.assertEqual(before, dashboard.app[RUNTIME_KEY].session)
            self.assertEqual((await dashboard.post('/api/player2/config', json={})).status, 403)
            self.assertEqual((await dashboard.get('/api/player2/config', headers={'Host': 'evil.example'})).status, 403)
            self.assertEqual((await dashboard.get('/api/player2/unknown')).status, 404)
            self.assertEqual((await dashboard.post('/api/player2/status', json={}, headers={'Origin': origin})).status, 404)
            ws = await peer.ws_connect('/gaze', headers={'Origin': 'http://localhost:8080'})
            self.assertEqual((await ws.receive_json())['user_id'], 2)
            await ws.close()
            await peer.close()
            self.assertEqual((await dashboard.get('/api/player2/status')).status, 503)
        finally:
            await dashboard.close()
            await peer.close()

    async def test_jpeg_camera_ack_and_disconnect(self):
        app = create_app(Path(self.tmp.name) / 'real.json')
        client = TestClient(TestServer(app))
        await client.start_server()
        runtime = app[RUNTIME_KEY]
        try:
            with self.assertRaises(aiohttp.WSServerHandshakeError):
                await client.ws_connect('/camera')
            token = runtime.config['token']
            ws = await client.ws_connect('/camera', headers={'Authorization': 'Bearer ' + token})
            with self.assertRaises(aiohttp.WSServerHandshakeError):
                await client.ws_connect('/camera', headers={'Authorization': 'Bearer ' + token})
            capture = cv2.VideoCapture(str(Path(__file__).resolve().parents[1] / 'assets' / 'eye_test.mp4'))
            ok, frame = capture.read()
            capture.release()
            self.assertTrue(ok)
            _, jpg = cv2.imencode('.jpg', cv2.resize(frame, (320, 240)))
            await ws.send_bytes(jpg.tobytes())
            self.assertEqual((await ws.receive()).data, 'ack')
            self.assertEqual(runtime.seq, 1)
            self.assertIsNotNone(runtime.jpg)
            await ws.send_bytes(b'bad jpeg')
            self.assertEqual((await ws.receive()).data, 'ack')
            self.assertFalse(runtime.packet()['tracking'])
            session = runtime.session
            await ws.close()
            await asyncio.sleep(.05)
            self.assertIsNone(runtime.receiver)
            self.assertFalse(runtime.packet()['valid'])
            self.assertNotEqual(runtime.session, session)
        finally:
            await client.close()

    async def test_pi_sender_reconnects_to_mac(self):
        mac_client = TestClient(TestServer(create_app(Path(self.tmp.name) / 'receiver.json')))
        await mac_client.start_server()
        runtime = mac_client.app[RUNTIME_KEY]
        capture = cv2.VideoCapture(str(Path(__file__).resolve().parents[1] / 'assets' / 'eye_test.mp4'))
        ok, frame = capture.read()
        capture.release()
        self.assertTrue(ok)
        _, jpg = cv2.imencode('.jpg', cv2.resize(frame, (320, 240)))

        def fake_camera(camera):
            while not camera.stop.is_set():
                with camera.lock:
                    camera.sequence += 1
                    camera.latest = (time.monotonic(), jpg.tobytes())
                    camera.status = 'test camera'
                camera.stop.wait(.03)

        async def wait_for(predicate):
            deadline = time.monotonic() + 6
            while not predicate():
                self.assertLess(time.monotonic(), deadline, 'sender failed to reconnect')
                await asyncio.sleep(.05)

        path = Path(self.tmp.name) / 'sender.json'
        save_config(path, dict(PI_DEFAULTS, admin_password='test-password', token=runtime.config['token'],
                               receiver=str(mac_client.make_url('/camera')).replace('http://', 'ws://')))
        with patch('exhibition.pi.Camera.run', fake_camera):
            pi_client = TestClient(TestServer(pi_app(path)))
            try:
                await pi_client.start_server()
                await wait_for(lambda: runtime.seq >= 2)
                self.assertTrue(runtime.packet()['tracking'])
                previous_session, previous_sequence = runtime.session, runtime.seq
                await runtime.receiver.close()
                await wait_for(lambda: runtime.receiver is not None and runtime.session != previous_session
                               and runtime.seq > previous_sequence)
                self.assertTrue(runtime.packet()['tracking'])
            finally:
                await pi_client.close()
                await mac_client.close()

    async def test_two_users_keep_calibration_and_cursor_separate(self):
        second = TestClient(TestServer(create_app(Path(self.tmp.name) / 'user2.json', simulate=True, user_id=2)))
        await second.start_server()
        runtime2 = second.app[RUNTIME_KEY]
        origin2 = str(second.make_url('')).rstrip('/')
        try:
            self.assertNotEqual(self.runtime.config['token'], runtime2.config['token'])
            inputs = [[(x - .5) * .8, (.5 - y) * .8] for x, y in POINTS]
            self.runtime.model = fit_calibration(inputs, POINTS)
            runtime2.model = fit_calibration(inputs, POINTS)
            await self.post('/api/demo', {'x': .2, 'y': .4})
            response = await second.post('/api/demo', json={'x': .8, 'y': .6}, headers={'Origin': origin2})
            self.assertEqual(response.status, 200)
            ws1 = await self.client.ws_connect('/gaze', headers={'Origin': self.origin})
            ws2 = await second.ws_connect('/gaze', headers={'Origin': origin2})
            packet1, packet2 = await asyncio.gather(ws1.receive_json(), ws2.receive_json())
            self.assertEqual((packet1['user_id'], packet2['user_id']), (1, 2))
            self.assertTrue(packet1['valid'] and packet2['valid'])
            self.assertLess(packet1['x'], .5)
            self.assertGreater(packet2['x'], .5)
            self.assertNotEqual(packet1['session_id'], packet2['session_id'])
            state2 = runtime2.packet()
            await self.post('/api/calibration', {'action': 'reset'})
            self.assertFalse(self.runtime.packet()['calibrated'])
            for field in ('calibrated', 'session_id', 'seq', 'x', 'y', 'direction'):
                self.assertEqual(runtime2.packet()[field], state2[field])
            self.assertTrue(runtime2.packet()['valid'])
            await ws1.close()
            await ws2.close()
        finally:
            await second.close()

    async def test_two_camera_receivers_have_independent_tracker_state(self):
        first = TestClient(TestServer(create_app(Path(self.tmp.name) / 'camera1.json', user_id=1)))
        second = TestClient(TestServer(create_app(Path(self.tmp.name) / 'camera2.json', user_id=2)))
        await first.start_server()
        await second.start_server()
        one, two = first.app[RUNTIME_KEY], second.app[RUNTIME_KEY]
        capture = cv2.VideoCapture(str(Path(__file__).resolve().parents[1] / 'assets' / 'eye_test.mp4'))
        ok, frame = capture.read()
        capture.release()
        self.assertTrue(ok)
        _, jpg = cv2.imencode('.jpg', cv2.resize(frame, (320, 240)))
        try:
            ws1 = await first.ws_connect('/camera', headers={'Authorization': 'Bearer ' + one.config['token']})
            ws2 = await second.ws_connect('/camera', headers={'Authorization': 'Bearer ' + two.config['token']})
            with self.assertRaises(aiohttp.WSServerHandshakeError) as error:
                await first.ws_connect('/camera', headers={'Authorization': 'Bearer ' + two.config['token']})
            self.assertEqual(error.exception.status, 401)
            await asyncio.gather(ws1.send_bytes(jpg.tobytes()), ws2.send_bytes(jpg.tobytes()))
            replies = await asyncio.gather(ws1.receive(), ws2.receive())
            self.assertTrue(all(reply.data == 'ack' for reply in replies))
            self.assertTrue(one.packet()['tracking'] and two.packet()['tracking'])
            self.assertIsNot(one.tracker, two.tracker)
            self.assertIsNot(one.tracker.ray_lines, two.tracker.ray_lines)
            state2 = two.packet()
            model2 = two.tracker.get_last_tracking_result()
            await ws1.close()
            await asyncio.sleep(.03)
            self.assertIsNone(one.receiver)
            self.assertIsNotNone(two.receiver)
            for field in ('session_id', 'seq', 'direction'):
                self.assertEqual(two.packet()[field], state2[field])
            self.assertEqual(two.tracker.get_last_tracking_result(), model2)
            self.assertTrue(two.packet()['tracking'])
            await ws2.close()
        finally:
            await first.close()
            await second.close()

    async def test_pi_ui_auth_and_save_without_camera(self):
        path = Path(self.tmp.name) / 'pi.json'
        save_config(path, dict(PI_DEFAULTS, admin_password='test-password'))
        # UI/config behavior is independent of actual camera hardware.
        with patch('exhibition.pi.Camera.run'):
            client = TestClient(TestServer(pi_app(path)))
            await client.start_server()
            try:
                self.assertEqual((await client.get('/api/config')).status, 401)
                headers = {'Authorization': 'Basic ' + base64.b64encode(b'admin:test-password').decode(),
                           'Origin': str(client.make_url('')).rstrip('/')}
                response = await client.get('/api/config', headers=headers)
                self.assertEqual(response.status, 200)
                self.assertNotIn('admin_password', await response.json())
                response = await client.post('/api/config', headers=headers,
                                             json={'receiver': 'ws://localhost:8080/camera', 'token': 'a' * 32, 'fps': 15})
                self.assertEqual(response.status, 200)
                self.assertEqual(load_config(path, {})['fps'], 15)
                response = await client.post('/api/config', headers=headers, json={'camera': -1})
                self.assertEqual(response.status, 400)
            finally:
                await client.close()


if __name__ == '__main__':
    unittest.main()
