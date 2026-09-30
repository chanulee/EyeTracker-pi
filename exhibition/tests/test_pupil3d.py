"""Pupil experiment: geometry/unit checks plus optional real-library replay."""
import importlib.util
import asyncio
from pathlib import Path
import time
import tempfile
import unittest

import cv2
import numpy as np
from aiohttp.test_utils import TestClient, TestServer

from exhibition.mac import DEFAULTS, Runtime, load_tracker, create_app, RUNTIME_KEY
from exhibition.tracking.pupil3d import PupilTracker, relative_angles


class DirectionCheck(unittest.TestCase):
    def test_relative_angles_with_camera_below_eye(self):
        forward = np.array([0., -.5, -np.sqrt(.75)])
        right = np.array([1., 0., 0.])
        up = np.cross(forward, right)
        yaw, pitch = np.radians([20., 10.])
        normal = np.cos(pitch) * (np.cos(yaw) * forward + np.sin(yaw) * right) + np.sin(pitch) * up
        angles = relative_angles(normal, forward)
        self.assertAlmostEqual(angles['yaw'], 20.)
        self.assertAlmostEqual(angles['pitch'], 10.)
        np.testing.assert_allclose(list(relative_angles(forward, forward).values()), [0, 0], atol=1e-8)
        with self.assertRaises(ValueError):
            relative_angles([0, 0, -1], [0, 0, 0])

    def test_pupil_runtime_ready_neutral_and_reset(self):
        class Tracker:
            metadata = {'engine': 'pupil', 'direction_frame': 'eye_camera'}

        runtime = Runtime(dict(DEFAULTS), Tracker())
        result = dict(pupil_ellipse={'center': [320, 240], 'axes': [80, 100], 'angle_degrees': 0},
                      confidence=.9, direction=[0, -.5, -np.sqrt(.75)], ready=True,
                      tracker_details=Tracker.metadata)
        runtime.accept(result)
        self.assertTrue(runtime.packet()['ready'])
        self.assertFalse(runtime.packet()['valid'])  # A 3D vector is not calibrated screen gaze.
        with self.assertRaises(ValueError):
            runtime.set_neutral()  # A single frame is insufficient.
        now = time.monotonic()
        runtime.direction_history.clear()
        for i in range(37):
            runtime.direction_history.append((now - .9 + i * .025, result['direction']))
        runtime.set_neutral()
        np.testing.assert_allclose(list(runtime.packet()['relative_angles'].values()), [0, 0], atol=1e-8)
        runtime.accept(None)
        self.assertFalse(runtime.packet()['tracking'])
        self.assertIsNone(runtime.packet()['relative_angles'])
        self.assertEqual(runtime.tracker_details['engine'], 'pupil')
        runtime.reset()
        self.assertIsNone(runtime.neutral_direction)
        self.assertEqual(len(runtime.direction_history), 0)

    @unittest.skipUnless(importlib.util.find_spec('pye3d'), 'Run with .venv-pupil/bin/python for real Pupil Labs replay')
    def test_real_pupil_3d_video(self):
        tracker = PupilTracker(load_tracker())
        capture = cv2.VideoCapture(str(Path(__file__).resolve().parents[1] / 'assets' / 'eye_test.mp4'))
        fps = capture.get(cv2.CAP_PROP_FPS) or 30
        directions = ready = 0
        try:
            for i in range(360):
                ok, image = capture.read()
                if not ok:
                    break
                tracker.process_frame(image, timestamp=i / fps)
                result = tracker.get_last_tracking_result()
                if result and result.get('direction'):
                    directions += 1
                    ready += result['ready']
                    self.assertTrue(np.isfinite(result['direction']).all())
                    self.assertAlmostEqual(np.linalg.norm(result['direction']), 1.)
                    self.assertGreaterEqual(result['tracker_details']['model_quality'], .5)
            self.assertGreater(directions, 100)
            self.assertGreater(ready, 0)
            tracker.process_frame(np.full((480, 640, 3), 255, np.uint8))
            self.assertIsNone(tracker.get_last_tracking_result())
            tracker.reset_tracking_state()
            self.assertEqual(len(tracker.centers), 0)
        finally:
            capture.release()


@unittest.skipUnless(importlib.util.find_spec('pye3d'), 'Pupil Labs environment required')
class PupilNetworkCheck(unittest.IsolatedAsyncioTestCase):
    async def test_pupil_jpeg_receiver_direction_status_and_overlay(self):
        with tempfile.TemporaryDirectory() as temporary:
            tracker = PupilTracker(load_tracker())
            app = create_app(Path(temporary) / 'mac.json', tracker=tracker)
            client = TestClient(TestServer(app))
            await client.start_server()
            runtime = app[RUNTIME_KEY]
            capture = cv2.VideoCapture(str(Path(__file__).resolve().parents[1] / 'assets' / 'eye_test.mp4'))
            directions = 0
            try:
                camera = await client.ws_connect('/camera', headers={'Authorization': 'Bearer ' + runtime.config['token']})
                for _ in range(45):
                    ok, image = capture.read()
                    self.assertTrue(ok)
                    _, encoded = cv2.imencode('.jpg', cv2.resize(image, (320, 240)))
                    await camera.send_bytes(encoded.tobytes())
                    self.assertEqual((await camera.receive()).data, 'ack')
                    packet = runtime.packet()
                    if packet['direction']:
                        directions += 1
                        self.assertAlmostEqual(np.linalg.norm(packet['direction']), 1.)
                        self.assertFalse(packet['valid'])
                self.assertGreater(directions, 0)
                status = await (await client.get('/api/status')).json()
                self.assertEqual(status['tracker_details']['engine'], 'pupil')
                self.assertEqual(status['direction_frame'], 'eye_camera')
                overlay = await client.get('/preview.jpg?overlay=1')
                self.assertEqual(overlay.status, 200)
                image = cv2.imdecode(np.frombuffer(await overlay.read(), np.uint8), cv2.IMREAD_COLOR)
                self.assertEqual(image.shape[:2], (480, 640))
                await camera.close()
                await asyncio.sleep(.05)
                self.assertIsNone(runtime.neutral_direction)
            finally:
                capture.release()
                await client.close()
