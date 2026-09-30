import asyncio
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import cv2
import numpy as np
from aiohttp.test_utils import TestClient, TestServer

from exhibition.frontend import create_app as frontend_app
from exhibition.gaze import POINTS, VALIDATION_POINTS
from exhibition.mac import create_app, RUNTIME_KEY

NODE = os.environ.get('EYE_NODE') or shutil.which('node')


class FrontendFlowCheck(unittest.TestCase):
    @unittest.skipUnless(NODE, 'Node required for frontend flow checks')
    def test_cursor_calibration_retry_and_cancel(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as temporary:
            module = Path(temporary) / 'flow.mjs'
            module.write_text((root / 'frontend-example' / 'flow.js').read_text())
            result = subprocess.run([NODE, str(root / 'tests' / 'test_frontend_flow.mjs'), str(module)],
                                    capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)


class FrontendProxyCheck(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.workers = []
        for user, name in ((1, 'mac-config.json'), (2, 'mac-user2-config.json')):
            client = TestClient(TestServer(create_app(self.root / name, simulate=True, user_id=user)))
            await client.start_server()
            self.workers.append(client)
        self.front = TestClient(TestServer(frontend_app(self.root, tuple(client.server.port for client in self.workers))))
        await self.front.start_server()
        self.origin = str(self.front.make_url('')).rstrip('/')

    async def asyncTearDown(self):
        await self.front.close()
        for client in self.workers:
            await client.close()
        self.temporary.cleanup()

    async def post(self, resource, data, user=1):
        return await self.front.post(f'/api/players/{user}/{resource}', json=data, headers={'Origin': self.origin})

    async def test_proxy_scope_origin_and_live_preview(self):
        response = await self.front.get('/api/players/1/plan')
        self.assertEqual((await response.json())['validation_points'], [list(point) for point in VALIDATION_POINTS])
        self.assertEqual((await self.front.get('/api/players/1/config')).status, 404)
        self.assertEqual((await self.front.get('/api/players/3/status')).status, 404)
        self.assertEqual((await self.front.get('/api/players/1/calibration')).status, 405)
        self.assertEqual((await self.front.post('/api/players/1/calibration', json={'action': 'reset'})).status, 403)
        self.assertEqual((await self.front.get('/api/players/1/status', headers={'Host': 'evil.example'})).status, 403)
        connections = await (await self.front.get('/connection.json')).text()
        self.assertNotIn(self.workers[0].app[RUNTIME_KEY].config['token'], connections)
        runtime = self.workers[0].app[RUNTIME_KEY]
        _, encoded = cv2.imencode('.jpg', np.full((240, 320, 3), 127, np.uint8))
        runtime.jpg = encoded.tobytes()
        await self.post('demo', {'x': .5, 'y': .5})
        preview = await self.front.get('/api/players/1/preview?overlay=1')
        self.assertEqual(preview.status, 200)
        self.assertEqual(cv2.imdecode(np.frombuffer(await preview.read(), np.uint8), cv2.IMREAD_COLOR).shape[:2], (480, 640))

    async def test_frontend_nine_points_three_validation_points_and_viewport(self):
        await self.post('demo', {'x': .5, 'y': .5})
        begin = await self.post('calibration', {'action': 'begin', 'viewport': {'width': 1200, 'height': 800}})
        session = (await begin.json())['session_id']
        runtime = self.workers[0].app[RUNTIME_KEY]
        peer_session = self.workers[1].app[RUNTIME_KEY].session

        async def feed(x, y, stop):
            while not stop.is_set():
                await self.post('demo', {'x': x, 'y': y})
                await asyncio.sleep(.025)

        for i, point in enumerate(POINTS + VALIDATION_POINTS):
            stop = asyncio.Event()
            task = asyncio.create_task(feed(*point, stop))
            data = {'action': 'sample' if i < 9 else 'validate', 'session_id': session}
            data['index' if i < 9 else 'validation_index'] = i if i < 9 else i - 9
            try:
                response = await self.post('calibration', data)
                self.assertEqual(response.status, 200, await response.text())
                result = await response.json()
                if i in (9, 10):
                    self.assertFalse(result['calibrated'])
                    self.assertIsNone(runtime.model)
                if i == 11:
                    self.assertTrue(result['calibrated'])
            finally:
                stop.set()
                await task
        self.assertEqual(runtime.packet()['calibration_viewport'], {'width': 1200, 'height': 800})
        self.assertEqual(peer_session, self.workers[1].app[RUNTIME_KEY].session)
        for _ in range(20):
            await self.post('demo', {'x': .7, 'y': .4})
            await asyncio.sleep(.025)
        self.assertTrue(runtime.packet()['valid'])
        self.assertAlmostEqual(runtime.packet()['x'], .7, delta=.025)
        stale_cancel = await self.post('calibration', {'action': 'cancel', 'session_id': 'old-session'})
        self.assertEqual(stale_cancel.status, 400)
        self.assertIsNotNone(runtime.model)
        runtime.received = 0
        self.assertFalse(runtime.packet()['valid'])
