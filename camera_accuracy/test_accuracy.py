"""Run: .venv/bin/python -m unittest camera_accuracy.test_accuracy -v"""
import asyncio
import json
from pathlib import Path
import unittest
import tempfile
import zipfile
from unittest.mock import patch
import importlib.util

from aiohttp.test_utils import TestClient, TestServer
import cv2
import numpy as np

from .server import create_app, load_tracker, RUNTIME_KEY
from .gaze import POINTS, VALIDATION_POINTS, fit_calibration, predict


def result(raw=(0., 0.)):
    return dict(direction=[*raw, 1.], confidence=1., ready=True,
                pupil_ellipse=dict(center=[320., 240.], axes=[60., 80.], angle_degrees=0.))


def raw_for(point):
    return [(point[0] - .5) * .8, (.5 - point[1]) * .8]


class BenchChecks(unittest.IsolatedAsyncioTestCase):
    async def test_refresh_reopens_usb_and_never_switches_to_builtin_camera(self):
        from .camera_device import select_usb_camera
        usb = dict(index=1, identity='usb-test', name='USB Camera', model='UVC Camera VendorID_1 ProductID_2')
        # Index can change on replug. Discovery must use identity, never probe index 0.
        with patch('camera_accuracy.camera_device.discover_usb_cameras', return_value=[usb]):
            self.assertEqual(select_usb_camera('usb-test')['index'], 1)
            with self.assertRaises(RuntimeError):
                select_usb_camera('unplugged-id')
        image = np.full((240, 320, 3), 100, np.uint8)

        class FakeCamera:
            def isOpened(self): return True
            def read(self): return True, image.copy()
            def set(self, *args): return True
            def get(self, key): return {cv2.CAP_PROP_FRAME_WIDTH: 320, cv2.CAP_PROP_FRAME_HEIGHT: 240, cv2.CAP_PROP_FPS: 30}.get(key, 0)
            def release(self): pass

        opens = []
        def open_camera(index, backend):
            opens.append(index)
            return FakeCamera()

        with patch('camera_accuracy.server.sys.platform', 'darwin'), patch('camera_accuracy.server.select_usb_camera', return_value=usb), patch('camera_accuracy.server.cv2.VideoCapture', side_effect=open_camera):
            client = TestClient(TestServer(create_app()))
            await client.start_server()
            runtime = client.app[RUNTIME_KEY]
            origin = str(client.make_url('')).rstrip('/')
            try:
                for _ in range(100):
                    if runtime.seq: break
                    await asyncio.sleep(.01)
                previous = runtime.session
                runtime.calibrating = True
                self.assertEqual((await client.post('/api/camera/refresh', json={}, headers={'Origin': origin})).status, 400)
                runtime.calibrating = False
                response = await client.post('/api/camera/refresh', json={}, headers={'Origin': origin})
                self.assertEqual(response.status, 200)
                for _ in range(100):
                    if len(opens) >= 2 and runtime.connected: break
                    await asyncio.sleep(.01)
                self.assertNotEqual(runtime.session, previous)
                self.assertEqual(opens, [1, 1])
                self.assertIsNone(runtime.model)
                self.assertEqual(runtime.camera_info['device']['identity'], 'usb-test')
                # Invalid detector requests cannot reset a valid session.
                current = runtime.session
                bad = await client.post('/api/detector', json={'engine': 'pure', 'roi': [0, 0, .01, 1]}, headers={'Origin': origin})
                self.assertEqual(bad.status, 400)
                self.assertEqual(runtime.session, current)
            finally:
                await client.close()

    async def test_recording_survives_reset_and_exports_synced_video(self):
        video = Path(__file__).resolve().parents[1] / 'exhibition/assets/eye_test.mp4'
        with tempfile.TemporaryDirectory() as directory:
            client = TestClient(TestServer(create_app(source=str(video), recording_root=directory)))
            await client.start_server()
            runtime = client.app[RUNTIME_KEY]
            origin = str(client.make_url('')).rstrip('/')

            async def post(action):
                response = await client.post('/api/recording', json={'action': action}, headers={'Origin': origin})
                self.assertEqual(response.status, 200, await response.text())
                return await response.json()

            async def wait_frames(count):
                for _ in range(100):
                    if runtime.recording.frame_count >= count:
                        return
                    await asyncio.sleep(.02)
                self.fail('Video frames were not recorded')

            try:
                for _ in range(100):
                    if runtime.seq:
                        break
                    await asyncio.sleep(.02)
                state = await post('start_log')
                identity = state['recording_id']
                await post('start_video')
                response = await client.post('/api/recording/event', headers={'Origin': origin}, json={
                    'phase': 'neutral', 'point': [.5, .5], 'client_timestamp_ms': 1000,
                    'message': '중앙 점', 'viewport': {'width': 1600, 'height': 900}})
                self.assertEqual(response.status, 200)
                await wait_frames(4)
                self.assertEqual((await client.get(f'/api/recording/{identity}.zip')).status, 400)
                await client.post('/api/calibration', json={'action': 'reset'}, headers={'Origin': origin})
                self.assertTrue(runtime.recording.state()['log_active'])
                self.assertTrue(runtime.recording.state()['video_active'])
                self.assertEqual(runtime.recording.state()['recording_id'], identity)
                await wait_frames(6)
                await post('stop_video')
                await post('start_video')
                await wait_frames(3)
                await post('stop_video')
                state = await post('stop_log')
                self.assertIsNotNone(state['download_url'])
                self.assertIsNone(state['error'])
                response = await client.get(state['download_url'])
                self.assertEqual(response.status, 200)
                archive_path = Path(directory) / 'export.zip'
                archive_path.write_bytes(await response.read())
                with zipfile.ZipFile(archive_path) as archive:
                    self.assertIsNone(archive.testzip())
                    logs = [json.loads(row) for row in archive.read('tracking.jsonl').decode().splitlines()]
                    self.assertTrue(any(row['type'] == 'target_display' and row['point'] == [.5, .5] for row in logs))
                    self.assertTrue(any(row['type'] == 'calibration_command' for row in logs))
                    video_logs = {(row['video_file'], row['video_frame_index']): row for row in logs
                                  if row['type'] == 'frame' and row['video_file']}
                    for segment in (1, 2):
                        stem = f'camera-{segment:02d}'
                        timestamps = [json.loads(row) for row in archive.read(f'{stem}-frames.jsonl').decode().splitlines()]
                        self.assertEqual([row['video_frame_index'] for row in timestamps], list(range(len(timestamps))))
                        self.assertTrue(all(video_logs[(f'{stem}.avi', row['video_frame_index'])]['seq'] == row['seq'] for row in timestamps))
                        local_video = Path(directory) / f'{stem}.avi'
                        local_video.write_bytes(archive.read(f'{stem}.avi'))
                        cap = cv2.VideoCapture(str(local_video))
                        count = 0
                        try:
                            while True:
                                ok, image = cap.read()
                                if not ok:
                                    break
                                self.assertEqual(image.shape[:2], (480, 640))
                                count += 1
                        finally:
                            cap.release()
                        self.assertEqual(count, len(timestamps))
                with self.assertRaises(ValueError):
                    runtime.recording.archive('..')
                new = await post('start_log')
                self.assertNotEqual(new['recording_id'], identity)
                await post('stop_log')
            finally:
                await client.close()

    async def test_calibration_rejects_bad_order_and_keeps_failure_for_retry(self):
        client = TestClient(TestServer(create_app(camera_enabled=False)))
        await client.start_server()
        runtime = client.app[RUNTIME_KEY]
        origin = str(client.make_url('')).rstrip('/')

        async def post(data):
            return await client.post('/api/calibration', json=data, headers={'Origin': origin})

        async def capture():
            runtime.capture_info = dict(valid_frames=24, total_frames=24, raw_p90=0., samples=[runtime.raw] * 24)
            return runtime.raw.copy()

        runtime.capture = capture  # Synthetic samples check API behavior, never physical accuracy.
        try:
            runtime.accept(result())
            plan = await (await client.get('/api/plan')).json()
            self.assertEqual((len(plan['points']), len(plan['validation_points'])), (9, 4))
            for path in ('/camera', '/gaze', '/gaze-client.js'):
                self.assertEqual((await client.get(path)).status, 404)
            self.assertEqual((await client.post('/api/calibration', json={'action': 'reset'})).status, 403)
            session = (await (await post({'action': 'begin', 'viewport': {'width': 1600, 'height': 900}})).json())['session_id']
            self.assertTrue(runtime.locked)
            self.assertEqual((await post({'action': 'sample', 'index': 1, 'session_id': session})).status, 400)
            for i, point in enumerate(POINTS):
                runtime.accept(result(raw_for(point)))
                response = await post({'action': 'sample', 'index': i, 'session_id': session})
                self.assertEqual(response.status, 200, await response.text())
            self.assertIsNotNone(runtime.candidate)
            self.assertIsNone(runtime.model)
            runtime.accept(result(raw_for((.9, .9))))
            self.assertEqual((await post({'action': 'validate', 'validation_index': 0, 'session_id': session})).status, 400)
            self.assertEqual(len(runtime.validation_errors), 0)
            failed = runtime.attempts[-1]
            self.assertFalse(failed['passed'])
            self.assertAlmostEqual(failed['error_px'], np.hypot(.6 * 1600, .6 * 900))
            for i, point in enumerate(VALIDATION_POINTS):
                runtime.accept(result(raw_for(point)))
                response = await post({'action': 'validate', 'validation_index': i, 'session_id': session})
                self.assertEqual(response.status, 200, await response.text())
                self.assertEqual((await response.json())['calibrated'], i == 3)
            report = await (await client.get('/api/report')).json()
            self.assertEqual(len(report['attempts']), 14)  # 9 samples, one failure, four successful validations.
            self.assertTrue(report['calibrated'])
            await post({'action': 'cancel', 'session_id': session})
            report = await (await client.get('/api/report')).json()
            self.assertFalse(report['calibrated'])
            self.assertIsNotNone(report['model'])
            self.assertEqual(report['viewport'], {'width': 1600, 'height': 900})
            self.assertEqual((await post({'action': 'sample', 'index': 0, 'session_id': session})).status, 400)
        finally:
            await client.close()

    async def test_actual_collection_and_inflight_cancel(self):
        client = TestClient(TestServer(create_app(camera_enabled=False)))
        await client.start_server()
        runtime = client.app[RUNTIME_KEY]
        origin = str(client.make_url('')).rstrip('/')
        runtime.accept(result())
        session = (await (await client.post('/api/calibration', json={'action': 'begin'}, headers={'Origin': origin})).json())['session_id']

        async def feed():
            for _ in range(30):
                runtime.accept(result((.1, -.1)))
                await asyncio.sleep(.05)

        feeder = asyncio.create_task(feed())
        try:
            raw = await runtime.capture()
            self.assertTrue(np.allclose(raw, [.1, -.1]))
            self.assertGreaterEqual(runtime.capture_info['valid_frames'], 12)
            pending = asyncio.create_task(client.post('/api/calibration',
                json={'action': 'sample', 'index': 0, 'session_id': session}, headers={'Origin': origin}))
            await asyncio.sleep(.1)
            await client.post('/api/calibration', json={'action': 'cancel', 'session_id': session}, headers={'Origin': origin})
            self.assertEqual((await pending).status, 400)
            self.assertEqual(runtime.points, [])
        finally:
            await feeder
            await client.close()

    async def test_recorded_camera_path_and_detector_baseline(self):
        from exhibition.mac import load_tracker as load_original
        original, copied = load_original(), load_tracker()
        video = Path(__file__).resolve().parents[1] / 'exhibition/assets/eye_test.mp4'
        cap = cv2.VideoCapture(str(video))
        try:
            original.eye_sphere_adjustment_enabled = copied.eye_sphere_adjustment_enabled = False
            for _ in range(8):
                ok, frame = cap.read()
                self.assertTrue(ok)
                original.process_frame(frame.copy())
                copied.process_frame(frame.copy())
                self.assertEqual(original.get_last_tracking_result(), copied.get_last_tracking_result())
        finally:
            cap.release()
        client = TestClient(TestServer(create_app(source=str(video))))
        await client.start_server()
        try:
            runtime = client.app[RUNTIME_KEY]
            for _ in range(100):
                if runtime.seq >= 3:
                    break
                await asyncio.sleep(.05)
            self.assertGreaterEqual(runtime.seq, 3)
            status = await (await client.get('/api/status')).json()
            self.assertTrue(status['camera_connected'])
            self.assertTrue(status['pupil_detected'])
            response = await client.get('/preview.jpg')
            self.assertEqual(response.status, 200)
            self.assertEqual(response.content_type, 'image/jpeg')
        finally:
            await client.close()


class MappingChecks(unittest.TestCase):
    def test_polynomial_interpolation_and_degenerate_data(self):
        model = fit_calibration([raw_for(p) for p in POINTS], POINTS)
        for point in VALIDATION_POINTS:
            self.assertTrue(np.allclose(predict(model, raw_for(point)), point))
        with self.assertRaises(ValueError):
            fit_calibration([[0., 0.]] * 9, POINTS)

    @unittest.skipUnless(importlib.util.find_spec('pupil_detectors') and importlib.util.find_spec('pypupilext'), 'Run with camera_accuracy/.venv/bin/python after install-detectors.sh')
    def test_native_detectors_choose_small_pupil_and_reject_absent_eye(self):
        from .detectors import OpenSourceTracker
        from .server import Runtime, DEFAULTS
        image = np.full((480, 640, 3), 180, np.uint8)
        cv2.circle(image, (320, 240), 100, (50, 50, 50), -1)  # Dark iris, diameter 200.
        cv2.circle(image, (320, 240), 35, (5, 5, 5), -1)     # Pupil, diameter 70.
        cv2.circle(image, (330, 230), 4, (255, 255, 255), -1) # Corneal reflection.
        for engine in ('pure', 'else', 'pupil-2d'):
            tracker = OpenSourceTracker(engine)
            tracker.process_frame(image)
            runtime = Runtime(dict(DEFAULTS, engine=engine), tracker)
            runtime.accept(tracker.get_last_tracking_result())
            self.assertIsNotNone(runtime.raw, engine)
            self.assertIsNone(runtime.direction)  # 2D features must not masquerade as 3D vectors.
            self.assertLess(np.linalg.norm(np.asarray(runtime.pupil['center']) - [320, 240]), 4, engine)
            self.assertTrue(60 < max(runtime.pupil['axes']) < 80, engine)
            tracker.configure(dict(tracker.settings, roi=[0, 0, .25, 1]))
            tracker.process_frame(image)
            runtime.accept(tracker.get_last_tracking_result())
            self.assertIsNone(runtime.raw, engine)
            tracker.configure(dict(tracker.settings, roi=[0, 0, 1, 1]))
            tracker.process_frame(np.full_like(image, 180))
            runtime.accept(tracker.get_last_tracking_result())
            self.assertIsNone(runtime.raw, engine)
        # Verify the real 3D adapter, and that calibration freezing ends afterward.
        tracker = OpenSourceTracker('pure-3d')
        runtime = Runtime(dict(DEFAULTS, engine='pure-3d'), tracker)
        runtime.locked = runtime.calibrating = True
        result3d = runtime.analyze(image)
        self.assertFalse(tracker.eye_sphere_adjustment_enabled)
        self.assertIsNotNone(result3d['pupil_ellipse'])
        self.assertFalse(result3d['ready'])
        runtime.calibrating = False
        runtime.analyze(image)
        self.assertTrue(tracker.eye_sphere_adjustment_enabled)


if __name__ == '__main__':
    unittest.main()
