"""Exhibition quality gates are optional; missing frames are still an error."""
import tempfile
import asyncio
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

import numpy as np
from aiohttp.test_utils import TestClient, TestServer
from eye_tracking.gaze import POINTS, fit_calibration, predict
from eye_tracking.mac import create_app, RUNTIME_KEY, Runtime, DEFAULTS


class RelaxedCalibrationCheck(unittest.IsolatedAsyncioTestCase):
    async def test_one_pass_accepts_poor_data_only_when_requested(self):
        samples = [[.02, .02]] * 9
        with self.assertRaises(ValueError):
            fit_calibration(samples, POINTS)
        model = fit_calibration(samples, POINTS, allow_inaccurate=True)
        self.assertTrue(np.isfinite(predict(model, samples[0])).all())
        self.assertGreater(model['fit_error'], .12)
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(Path(directory) / 'config.json', simulate=True)
            runtime = app[RUNTIME_KEY]
            async with TestClient(TestServer(app)) as client:
                origin = str(client.make_url('/')).rstrip('/')

                async def command(body):
                    return await client.post('/api/calibration', json=body, headers={'Origin': origin})

                for relaxed in (True, False):
                    runtime.raw, runtime.ready = [.02, .02], True
                    runtime.received = time.monotonic()
                    start = await command({'action': 'begin', 'allow_inaccurate': relaxed})
                    session = (await start.json())['session_id']
                    runtime.capture = AsyncMock(return_value=[.02, .02])
                    if relaxed:
                        for index in range(9):
                            response = await command({'action': 'sample', 'session_id': session, 'index': index})
                            self.assertEqual(response.status, 200, await response.text())
                    else:
                        runtime.candidate = model
                    for index in range(3):
                        response = await command({'action': 'validate', 'session_id': session, 'validation_index': index})
                        if not relaxed:
                            self.assertEqual(response.status, 400)
                            self.assertIsNone(runtime.model)
                            break
                        self.assertEqual(response.status, 200, await response.text())
                    if relaxed:
                        result = await response.json()
                        self.assertTrue(result['calibrated'])
                        self.assertGreater(result['validation_error'], .12)
                runtime.allow_inaccurate = True
                runtime.received = 0
                with self.assertRaisesRegex(ValueError, '유효 프레임'):
                    await Runtime.capture(runtime)

    def test_verified_2d_output_maps_to_frontend_without_fake_3d_direction(self):
        runtime = Runtime(dict(DEFAULTS))
        runtime.model = fit_calibration(POINTS, POINTS)
        runtime.accept({'raw': [.3, .7], 'direction': None, 'ready': True, 'confidence': .9,
                        'pupil_ellipse': {'center': [416, 72], 'axes': [70, 66], 'angle_degrees': 0},
                        'tracker_details': {'engine': 'deepvog-verified', 'input_kind': 'pupil_center_2d'}})
        packet = runtime.packet()
        self.assertTrue(packet['valid'])
        self.assertTrue(packet['ready'])
        self.assertEqual(packet['input_kind'], 'pupil_center_2d')
        self.assertIsNone(packet['direction'])
        self.assertAlmostEqual(packet['x'], .3)
        self.assertAlmostEqual(packet['y'], .7)
        runtime.accept({'raw': [float('nan'), .7], 'ready': True, 'confidence': .9,
                        'pupil_ellipse': {'center': [416, 72]},
                        'tracker_details': {'input_kind': 'pupil_center_2d'}})
        self.assertFalse(runtime.packet()['tracking'])

    async def test_verified_capture_waits_for_twelve_real_samples_at_low_fps(self):
        runtime = Runtime(dict(DEFAULTS))
        payload = {'raw': [.1, .2], 'ready': True, 'confidence': .9,
                   'pupil_ellipse': {'center': [320, 240]},
                   'tracker_details': {'engine': 'deepvog-verified', 'input_kind': 'pupil_center_2d'}}
        runtime.accept(payload)
        started = time.monotonic()
        capture = asyncio.create_task(runtime.capture())
        await asyncio.sleep(0)
        for _ in range(12):
            await asyncio.sleep(.2)
            runtime.accept(payload)
        self.assertEqual(await capture, [.1, .2])
        self.assertGreater(time.monotonic() - started, 1.2)
        self.assertLess(time.monotonic() - started, 4.2)
