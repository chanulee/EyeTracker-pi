"""Pi multipart input keeps fresh frames without opening a local camera."""
import asyncio
import unittest

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
import cv2
import numpy as np

from camera_accuracy.stream_capture import StreamCapture
from camera_accuracy.server import create_app, RUNTIME_KEY
import time


class StreamChecks(unittest.IsolatedAsyncioTestCase):
    async def test_live_input_drops_backlog_and_reports_disconnect(self):
        async def stream(request):
            response = web.StreamResponse(headers={'Content-Type': 'multipart/x-mixed-replace; boundary=frame'})
            await response.prepare(request)
            try:
                for value in range(0, 240, 20):
                    _, jpg = cv2.imencode('.jpg', np.full((24, 32, 3), value, np.uint8))
                    data = jpg.tobytes()
                    await response.write(b'--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ' + str(len(data)).encode() + b'\r\n\r\n' + data + b'\r\n')
                    await asyncio.sleep(.02)
                await asyncio.sleep(.2)
                await response.write(b'--frame--\r\n')
            except ConnectionError:
                pass
            return response

        app = web.Application()
        app.router.add_get('/camera.mjpg', stream)
        async with TestServer(app) as server:
            capture = await StreamCapture().open(str(server.make_url('/camera.mjpg')))
            try:
                await asyncio.sleep(.2)
                ok, image = await capture.read()
                self.assertTrue(ok)
                self.assertGreater(image.mean(), 100)
                self.assertEqual(capture.queue.maxsize, 1)
                await asyncio.sleep(.4)
                with self.assertRaises(ConnectionError):
                    await capture.read()
            finally:
                await capture.release()

    async def test_preview_survives_short_delay_but_gaze_stays_invalid(self):
        app = create_app(camera_enabled=False)
        runtime = app[RUNTIME_KEY]
        async with TestClient(TestServer(app)) as client:
            runtime.jpg = b'preview-fixture'
            runtime.connected = True
            runtime.raw = [.1, .1]
            runtime.received = time.monotonic() - .7
            response = await client.get('/preview.jpg')
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertFalse(runtime.packet()['tracking'])
            self.assertFalse(runtime.packet()['valid'])
            runtime.received = time.monotonic() - 2.1
            self.assertEqual((await client.get('/preview.jpg')).status, 503)
