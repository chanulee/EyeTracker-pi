"""Exercise the real MJPEG → authenticated camera and legacy sensor/audio paths."""
import asyncio
from pathlib import Path
import tempfile
import unittest

import cv2
import numpy as np
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from eye_tracking.mac import create_app as mac_app, RUNTIME_KEY
from stream_bridge import create_app, sensor_packet


class StreamBridgeTest(unittest.IsolatedAsyncioTestCase):
    def test_stale_and_invalid_orientation_stay_invalid(self):
        state = dict(age_s=.1, quaternion=[0, 0, 0, 1], mic={'ready': True})
        self.assertEqual(sensor_packet(state)['imu']['status'], 'ok')
        for changes in ({'age_s': 1}, {'stale': True}, {'error': 'I2C lost'},
                        {'quaternion': None}, {'quaternion': [0, 0, 0, 0]},
                        {'quaternion': [float('nan'), 0, 0, 1]}):
            self.assertEqual(sensor_packet(dict(state, **changes))['imu']['status'], 'unavailable')

    async def test_real_detector_sensor_audio_and_disconnect(self):
        _, encoded = cv2.imencode('.jpg', np.zeros((240, 320, 3), dtype=np.uint8))
        jpg = encoded.tobytes()
        stop_camera = asyncio.Event()
        state = dict(age_s=.01, quaternion=[0, 0, 0, 1], accel=[1, 2, 3],
                     mic=dict(ready=True, age_s=.01, rms_db=-30, peak_db=-20))

        async def snapshot(request):
            return web.json_response(state)

        async def audio(request):
            return web.Response(body=b'\x01\x00' * 160, content_type='application/octet-stream')

        async def camera(request):
            response = web.StreamResponse(headers={'Content-Type': 'multipart/x-mixed-replace; boundary=frame'})
            await response.prepare(request)
            try:
                while not stop_camera.is_set():
                    payload = b'--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ' + str(len(jpg)).encode() + b'\r\n\r\n' + jpg + b'\r\n'
                    # Multipart boundaries and JPEG data may cross transport chunks.
                    await response.write(payload[:53])
                    await response.write(payload[53:])
                    await asyncio.sleep(.03)
            except (ConnectionError, asyncio.CancelledError):
                pass
            return response

        pi = web.Application()
        pi.add_routes([web.get('/state', snapshot), web.get('/audio', audio), web.get('/camera.mjpg', camera)])
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'mac.json'
            mac = mac_app(config)
            async with TestClient(TestServer(pi)) as source, TestClient(TestServer(mac)) as receiver:
                bridge = create_app(str(source.make_url('')).rstrip('/'), config,
                                    str(receiver.make_url('/camera')).replace('http:', 'ws:', 1))
                async with TestClient(TestServer(bridge)) as client:
                    async with client.get('/api/stream') as response:
                        packet = await response.content.readline()
                        self.assertIn(b'"q": [0, 0, 0, 1]', packet)
                        self.assertIn(b'"rms_db": -30', packet)
                    async with client.get('/api/audio') as response:
                        self.assertEqual(await response.read(), b'\x01\x00' * 160)
                    runtime = mac[RUNTIME_KEY]
                    for _ in range(100):
                        if runtime.seq:
                            break
                        await asyncio.sleep(.03)
                    self.assertGreater(runtime.seq, 0)
                    self.assertTrue(runtime.packet()['camera_connected'])
                    self.assertIsNotNone(runtime.jpg)
                    self.assertFalse(runtime.packet()['valid'])  # A black frame cannot create a gaze.
                    session = runtime.session
                    stop_camera.set()
                    for _ in range(100):
                        if not runtime.packet()['camera_connected']:
                            break
                        await asyncio.sleep(.03)
                    self.assertFalse(runtime.packet()['camera_connected'])
                    self.assertNotEqual(runtime.session, session)


if __name__ == '__main__':
    unittest.main()
