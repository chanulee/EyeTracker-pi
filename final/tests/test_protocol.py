"""Run from final/: python -m unittest discover -s tests -p 'test_*.py' -v."""
import array
import asyncio
import contextlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import cv2
from aiohttp import WSServerHandshakeError
from aiohttp.test_utils import TestClient, TestServer
from eye_tracking.common import load_config, save_config
from eye_tracking.frontend import create_app as bridge_app
from eye_tracking.gaze import POINTS, VALIDATION_POINTS
from eye_tracking.mac import create_app, RUNTIME_KEY

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'sensors'))
from audio_stream import AudioBus, pcm16


class AudioCheck(unittest.TestCase):
    def test_shared_audio_has_correct_format_and_bounded_backlog(self):
        raw = array.array('i', [1000000000 + v for v in [65536] * 3 + [-65536] * 3])
        if sys.byteorder != 'little':
            raw.byteswap()
        self.assertEqual(pcm16(raw.tobytes()), b'\x01\x00\xff\xff')
        with self.assertRaises(ValueError):
            pcm16(b'\0' * 4)
        bus = AudioBus()
        first, second = bus.subscribe(), bus.subscribe()
        for i in range(10):
            bus.publish(bytes([i]))
        self.assertEqual(first.qsize(), 4)
        self.assertEqual(second.qsize(), 4)
        self.assertEqual(first.get_nowait(), b'\x06')
        bus.unsubscribe(first)
        self.assertEqual(len(bus.clients), 1)


class ProtocolCheck(unittest.IsolatedAsyncioTestCase):
    async def test_real_detector_receives_one_authenticated_camera_and_resets_on_disconnect(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(Path(directory) / 'mac-config.json')
            runtime = app[RUNTIME_KEY]
            async with TestClient(TestServer(app)) as client:
                with self.assertRaises(WSServerHandshakeError) as denied:
                    await client.ws_connect('/camera')
                self.assertEqual(denied.exception.status, 401)
                headers = {'Authorization': 'Bearer ' + runtime.config['token']}
                async with client.ws_connect('/camera', headers=headers) as camera:
                    with self.assertRaises(WSServerHandshakeError) as duplicate:
                        await client.ws_connect('/camera', headers=headers)
                    self.assertEqual(duplicate.exception.status, 409)
                    ok, jpg = cv2.imencode('.jpg', np.zeros((240, 320, 3), dtype=np.uint8))
                    self.assertTrue(ok)
                    await camera.send_bytes(jpg.tobytes())
                    self.assertEqual((await camera.receive(timeout=5)).data, 'ack')
                    status = await (await client.get('/api/status')).json()
                    self.assertTrue(status['camera_connected'])
                    self.assertEqual(status['seq'], 1)
                    self.assertFalse(status['pupil_detected'])
                    runtime.model = {'previous_visitor': True}
                for _ in range(100):
                    if runtime.receiver is None:
                        break
                    await asyncio.sleep(.01)
                self.assertIsNone(runtime.model)
                self.assertFalse(runtime.packet()['camera_connected'])

    async def test_one_participant_calibrates_through_bridge_and_stale_input_expires(self):
        with tempfile.TemporaryDirectory() as directory:
            workers, clients, runtimes = [], [], []
            feeder = None
            try:
                for user, name in ((1, 'mac-config.json'),):
                    server = TestServer(create_app(Path(directory) / name, simulate=True, user_id=user))
                    await server.start_server()
                    workers.append(server)
                    runtime = server.app[RUNTIME_KEY]
                    runtimes.append(runtime)
                    config = load_config(Path(directory) / name, {})
                    config['require_gaze_token'] = True
                    runtime.config.update(config)
                    save_config(Path(directory) / name, config)
                bridge = TestClient(TestServer(bridge_app(directory, [s.port for s in workers])))
                clients.append(bridge)
                await bridge.start_server()
                origin = str(bridge.make_url('/')).rstrip('/')
                paused = set()

                async def feed():
                    while True:
                        for user, runtime in enumerate(runtimes, 1):
                            if user in paused:
                                continue
                            n = len(runtime.points)
                            point = (POINTS[n] if n < 9 else VALIDATION_POINTS[min(2, len(runtime.validation_errors))]) if runtime.calibrating else (.5, .5)
                            direction = np.array([(point[0] - .5) * .8, (.5 - point[1]) * .8, 1.])
                            runtime.accept({'direction': (direction / np.linalg.norm(direction)).tolist(), 'confidence': 1., 'ready': True,
                                'pupil_ellipse': {'center': [160, 120], 'axes': [30, 40], 'angle_degrees': 0}})
                        await asyncio.sleep(.025)

                feeder = asyncio.create_task(feed())
                await asyncio.sleep(.1)
                async def command(user, body, headers=None):
                    response = await bridge.post(f'/api/players/{user}/calibration', json=body, headers=headers or {'Origin': origin})
                    self.assertEqual(response.status, 200, await response.text())
                    return await response.json()

                denied = await bridge.post('/api/players/1/calibration', json={'action': 'reset'}, headers={'Origin': 'http://elsewhere.invalid'})
                self.assertEqual(denied.status, 403)
                hidden = await bridge.get('/api/players/1/config')
                self.assertEqual(hidden.status, 404)
                guide = await bridge.get('/api/players/2/status')
                self.assertEqual(guide.status, 404)
                for user in (1,):
                    start = await command(user, {'action': 'begin', 'viewport': {'width': 1200, 'height': 800}})
                    session = start['session_id']
                    for index in range(9):
                        await command(user, {'action': 'sample', 'session_id': session, 'index': index})
                    for index in range(3):
                        result = await command(user, {'action': 'validate', 'session_id': session, 'validation_index': index})
                    self.assertTrue(result['calibrated'])
                for user in (1,):
                    async with bridge.ws_connect(f'/gaze?user_id={user}', headers={'Origin': origin}) as ws:
                        for _ in range(30):
                            packet = json.loads((await ws.receive(timeout=2)).data)
                            if packet['valid']:
                                break
                        self.assertTrue(packet['valid'], packet)
                        self.assertEqual(packet['user_id'], user)
                        self.assertEqual(packet['calibration_viewport'], {'width': 1200, 'height': 800})
                paused.add(1)
                await asyncio.sleep(.4)
                self.assertFalse(runtimes[0].packet()['valid'])
                self.assertIsNone(runtimes[0].packet()['x'])
                await command(1, {'action': 'reset'})
                self.assertIsNone(runtimes[0].model)
            finally:
                if feeder:
                    feeder.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await feeder
                for client in clients:
                    await client.close()
                for server in workers:
                    await server.close()


if __name__ == '__main__':
    unittest.main()
