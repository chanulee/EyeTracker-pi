"""Mac USB eye-camera bench: local HTTP only, exhibition tracking baseline."""
import argparse
import asyncio
from collections import deque
from concurrent.futures import ThreadPoolExecutor
import functools
import hashlib
import importlib.util
import json
import logging
import math
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.parse import urlsplit

from aiohttp import web
import cv2
import numpy as np

from .gaze import POINTS, VALIDATION_POINTS, Stabilizer, fit_calibration, predict, features
from .recording import Recording
from .camera_device import select_usb_camera

HERE = Path(__file__).parent
RUNTIME_KEY = web.AppKey('runtime', object)
DEFAULTS = dict(smoothing_ms=80, max_speed=4., confidence=.65, flip=False, engine='orlosky', focal_length=560.)
LOG = logging.getLogger('camera-accuracy')


def number(value, low, high, integer=False):
    # Same trust-boundary validation as exhibition.common.number.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('숫자를 입력하세요')
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'허용 범위: {low}–{high}')
    if integer and int(value) != value:
        raise ValueError('정수를 입력하세요')
    return int(value) if integer else float(value)


def load_tracker(engine='orlosky', focal_length=560.):
    if engine != 'orlosky':
        from .detectors import OpenSourceTracker
        return OpenSourceTracker(engine, focal_length)
    path = HERE / 'tracking' / 'Orlosky3DEyeTracker.py'
    spec = importlib.util.spec_from_file_location('orlosky', path)
    tracker = importlib.util.module_from_spec(spec)
    tracker.HEADLESS = True
    spec.loader.exec_module(tracker)
    tracker.DISPLAY_ENABLED = False
    tracker.WRITE_GAZE_FILE = False
    tracker.GL_SPHERE_AVAILABLE = False
    return tracker


class Runtime:
    def __init__(self, config, tracker):
        self.user_id = 1
        self.config = config
        self.tracker = tracker
        self.lock = asyncio.Lock()  # All tracker globals are owned by this single worker.
        self.filter = Stabilizer()
        self.connected = False
        self.camera_info = {}
        self.attempts = []
        self.report_model = self.report_viewport = None
        self.jpg = None
        self.received = 0.
        self.seq = 0
        self.frame_times = deque(maxlen=60)
        self.processing_ms = None
        self.error = '로컬 카메라 연결 대기'
        self.reset()

    def reset(self):
        self.session = secrets.token_hex(8)
        self.model = self.candidate = None
        self.points = []
        self.validation_errors = []
        self.calibration_viewport = None
        self.collecting = None
        self.collecting_details = None
        self.calibrating = False
        self.raw = self.direction = self.origin = self.pupil = self.xy = None
        self.confidence = 0.
        self.detection_quality = 0.
        self.pupil_detected = False
        self.pupil_candidate = None
        self.tracker_details = dict(getattr(self.tracker, 'metadata', {}))
        self.ready = False
        self.filter.reset()
        self.reset_pending = True
        self.locked = False

    def packet(self):
        age = time.monotonic() - self.received
        tracking = age < .35 and self.raw is not None
        valid = bool(tracking and self.model and not self.calibrating and self.xy is not None)
        return dict(type='gaze', version=1, user_id=self.user_id, seq=self.seq, timestamp_ms=round(time.time() * 1000),
                    session_id=self.session, valid=valid, tracking=tracking, calibrated=self.model is not None,
                    ready=bool(tracking and self.ready), x=self.xy[0] if valid else None,
                    y=self.xy[1] if valid else None, raw=self.raw if tracking else None,
                    direction=self.direction if tracking else None, origin=self.origin if tracking else None,
                    pupil=self.pupil if tracking else None, confidence=self.confidence if tracking else 0.,
                    frame_age_ms=round(age * 1000) if self.received else None,
                    camera_connected=self.connected, error=self.error,
                    input_kind=self.tracker_details.get('input_kind', 'optical_axis'),
                    tracker_details=self.tracker_details,
                    direction_frame=self.tracker_details.get('direction_frame'),
                    origin_unit=self.tracker_details.get('origin_unit'),
                    calibration_viewport=self.calibration_viewport if self.model else None)

    def analyze(self, image):
        if self.reset_pending:
            self.tracker.reset_tracking_state()
            self.reset_pending = False
        # Pye3d can adapt to headset slippage after the screen fit is complete.
        self.tracker.eye_sphere_adjustment_enabled = not self.calibrating if self.config['engine'] in ('pupil-3d', 'pure-3d') else not self.locked
        if self.config['flip']:
            image = cv2.flip(image, -1)
        self.tracker.process_frame(image)
        return self.tracker.get_last_tracking_result()

    def accept(self, result, jpg=None):
        now = time.monotonic()
        self.received = now
        self.seq += 1
        self.frame_times.append(now)
        if jpg is not None:
            self.jpg = jpg
        confidence = result.get('confidence', 0.) if result else 0.
        self.detection_quality = float(confidence)
        self.pupil_detected = bool(result and result.get('pupil_ellipse'))
        self.pupil_candidate = result.get('pupil_ellipse') if result else None
        self.tracker_details = result.get('tracker_details', {}) if result else dict(getattr(self.tracker, 'metadata', {}))
        direction = result.get('direction') if result else None
        raw2d = result.get('raw') if result and self.tracker_details.get('input_kind') == 'pupil_center_2d' else None
        input_ok = (isinstance(raw2d, list) and len(raw2d) == 2 and np.isfinite(raw2d).all()) if raw2d is not None else (
            direction is not None and len(direction) == 3 and np.isfinite(direction).all())
        if (not input_ok
                or confidence < self.config['confidence'] or not result.get('pupil_ellipse')):
            self.raw = self.direction = self.origin = self.pupil = self.xy = None
            self.confidence = 0.
            self.filter.reset()
            self.error = ('동공 후보 없음' if not self.pupil_detected else
                          f'동공 후보 품질 부족 ({confidence:.2f} / 기준 {self.config["confidence"]:.2f})' if confidence < self.config['confidence'] else
                          (result.get('tracker_error') or '동공 후보 검출; 시선 방향 계산 실패'))
            return
        self.raw = raw2d if raw2d is not None else [direction[0], direction[1]]
        self.direction, self.origin = direction, result.get('origin')
        self.pupil = result['pupil_ellipse']
        self.confidence = confidence
        self.ready = bool(result['ready']) if 'ready' in result else bool(
            self.tracker and len(getattr(self.tracker, 'model_centers', [])) >= 30
            and getattr(self.tracker, 'max_observed_distance', 0) > 0)
        self.error = None
        if self.collecting is not None:
            self.collecting.append(self.raw.copy())
            self.collecting_details.append(dict(timestamp_s=now, direction=direction, pupil=self.pupil,
                confidence=confidence, eye_center=result.get('eye_center'), sphere_radius=result.get('sphere_radius')))
        self.xy = self.filter.update(predict(self.model, self.raw), now,
                                     self.config['smoothing_ms'] / 1000, self.config['max_speed']) if self.model else None

    async def capture(self):
        if self.collecting is not None:
            raise ValueError('이미 수집 중입니다')
        samples = []
        details = []
        first_seq = self.seq
        started = time.monotonic()
        self.collecting = samples
        self.collecting_details = details
        try:
            await asyncio.sleep(1.2)
        finally:
            if self.collecting is samples:
                self.collecting = None
                self.collecting_details = None
        median = np.median(samples, axis=0) if samples else None
        p90 = float(np.percentile(np.linalg.norm(np.asarray(samples) - median, axis=1), 90)) if samples else None
        self.capture_info = dict(samples=samples, frames=details, valid_frames=len(samples), total_frames=self.seq - first_seq,
                                 duration_s=time.monotonic() - started,
                                 raw_median=median.tolist() if median is not None else None, raw_p90=p90)
        if not self.packet()['tracking'] or len(samples) < 12:
            raise ValueError('유효 프레임이 부족합니다. 동공/조명/연결을 확인하세요')
        if p90 > .08:
            raise ValueError('시선이 흔들렸습니다. 같은 점을 다시 보세요')
        return median.tolist()


def create_app(config=None, tracker=None, source=0, fps=20, camera_enabled=True, recording_root=None):
    config = dict(DEFAULTS, **(config or {}))
    runtime = Runtime(config, tracker if tracker is not None else load_tracker(config['engine'], config['focal_length']))
    recording = runtime.recording = Recording(recording_root or HERE / 'recordings', fps)
    executor = ThreadPoolExecutor(max_workers=1)

    async def work(function, *args):
        return await asyncio.get_running_loop().run_in_executor(executor, function, *args)

    def snapshot():
        return dict(engine=runtime.config['engine'], tracker_metadata=dict(getattr(runtime.tracker, 'metadata', {})),
                    detector_settings=dict(getattr(runtime.tracker, 'settings', {})), source=str(source), config=dict(runtime.config),
                    camera=dict(runtime.camera_info), status=runtime.packet(),
                    points=POINTS, validation_points=VALIDATION_POINTS, model=runtime.report_model,
                    viewport=runtime.report_viewport, tracker_sha256=hashlib.sha256(
                        (HERE / ('tracking/Orlosky3DEyeTracker.py' if runtime.config['engine'] == 'orlosky' else 'detectors.py')).read_bytes()).hexdigest())

    @web.middleware
    async def errors(request, handler):
        if (request.remote not in ('127.0.0.1', '::1')
                or urlsplit('http://' + request.host).hostname not in ('localhost', '127.0.0.1', '::1')):
            raise web.HTTPForbidden(text='localhost에서 접속하세요')
        if request.method != 'GET' and request.headers.get('Origin') != f'{request.scheme}://{request.host}':
            raise web.HTTPForbidden(text='같은 테스트 화면에서 요청하세요')
        try:
            response = await handler(request)
            if request.path == '/api/calibration':
                recording.event('calibration_response', response=json.loads(response.text),
                                session_id=runtime.session, model=runtime.report_model, viewport=runtime.report_viewport)
            response.headers['Cache-Control'] = 'no-store'
            return response
        except (ValueError, TypeError, KeyError) as error:
            recording.event('api_error', path=request.path, error=str(error), session_id=runtime.session)
            raise web.HTTPBadRequest(text=str(error))

    app = web.Application(middlewares=[errors], client_max_size=8192)
    app[RUNTIME_KEY] = runtime
    stopping = asyncio.Event()
    reconnect = asyncio.Event()

    async def refresh_camera(request):
        if not camera_enabled or isinstance(source, str):
            raise ValueError('USB 카메라 입력에서만 다시 연결할 수 있습니다')
        async with runtime.lock:
            if runtime.calibrating or recording.video is not None:
                raise ValueError('보정과 영상 녹화를 종료한 뒤 카메라를 다시 연결하세요')
            reconnect.set()
            runtime.reset()
            runtime.connected = False
            runtime.jpg = None
            runtime.received = 0.
            runtime.error = 'USB 카메라를 다시 찾는 중입니다'
            recording.event('camera_refresh', session_id=runtime.session)
        return web.json_response({'reconnecting': True})

    async def detector_settings(request):
        data = await request.json()
        if not isinstance(data, dict) or data.get('engine') not in ('orlosky', 'pupil-2d', 'pupil-3d', 'pure', 'pure-3d', 'else'):
            raise ValueError('지원하는 검출기를 선택하세요')
        settings = dict(pupil_min=number(data.get('pupil_min', 10), 3, 200, integer=True),
            pupil_max=number(data.get('pupil_max', 160), 4, 400, integer=True),
            intensity_range=number(data.get('intensity_range', 23), 1, 100, integer=True))
        if settings['pupil_min'] >= settings['pupil_max']:
            raise ValueError('동공 최소 크기는 최대 크기보다 작아야 합니다')
        roi = data.get('roi', [0, 0, 1, 1])
        if not isinstance(roi, list) or len(roi) != 4:
            raise ValueError('눈 영역 좌표 4개가 필요합니다')
        settings['roi'] = [number(value, 0, 1) for value in roi]
        if roi[2] - roi[0] < .1 or roi[3] - roi[1] < .1:
            raise ValueError('눈 영역의 너비와 높이는 영상의 10% 이상이어야 합니다')
        focal_length = number(data.get('focal_length', 560.), 100, 3000)
        async with runtime.lock:
            if runtime.calibrating:
                raise ValueError('보정을 취소한 뒤 검출 설정을 바꾸세요')
            try:
                tracker = await work(load_tracker, data['engine'], focal_length)
            except ImportError as error:
                raise ValueError(f'검출기 설치가 필요합니다: {error}')
            if data['engine'] == 'orlosky' and roi != [0, 0, 1, 1]:
                raise ValueError('기존 Orlosky 비교 모드는 눈 영역 설정을 지원하지 않습니다')
            if hasattr(tracker, 'configure'):
                await work(tracker.configure, settings)
            runtime.tracker = tracker
            runtime.config.update(engine=data['engine'], focal_length=focal_length)
            runtime.reset()
            runtime.attempts = []
            runtime.report_model = runtime.report_viewport = None
            recording.event('detector_settings', settings=settings, config=dict(runtime.config),
                            tracker_metadata=getattr(tracker, 'metadata', {}), session_id=runtime.session)
        return web.json_response(dict(engine=data['engine'], settings=settings, focal_length=focal_length))

    async def capture_point(action, index, target, session):
        record = dict(action=action, index=index, target=list(target), timestamp_ms=round(time.time() * 1000))
        # Keep retries too: otherwise repeated validation failures disappear from diagnosis.
        try:
            raw = await runtime.capture()
        except ValueError as error:
            if session == runtime.session:
                record.update(getattr(runtime, 'capture_info', {}), passed=False, error=str(error))
                runtime.attempts.append(record)
                recording.event('capture_result', result=record)
            raise
        if session != runtime.session:
            raise ValueError('보정이 취소되었습니다')
        record.update(runtime.capture_info, eye_center=getattr(runtime.tracker, 'prev_model_center_avg', None),
                      sphere_radius=getattr(runtime.tracker, 'max_observed_distance', None))
        runtime.attempts.append(record)
        recording.event('capture_result', result=record)
        return raw, record

    async def calibration(request):
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError('JSON 객체를 입력하세요')
        action = data['action']
        recording.event('calibration_command', command=data, session_id=runtime.session)
        session = runtime.session
        if action in ('reset', 'begin', 'cancel'):
            viewport = data.get('viewport')
            if action == 'begin' and viewport is not None:
                if not isinstance(viewport, dict) or set(viewport) != {'width', 'height'}:
                    raise ValueError('화면 너비와 높이를 입력하세요')
                viewport = {key: number(value, 100, 20000, integer=True) for key, value in viewport.items()}
            async with runtime.lock:
                if action == 'reset':
                    runtime.reset()
                    runtime.attempts = []
                    runtime.report_model = runtime.report_viewport = None
                elif action == 'cancel':
                    if data.get('session_id') and data['session_id'] != runtime.session:
                        raise ValueError('보정 세션이 만료되었습니다')
                    runtime.session = secrets.token_hex(8)  # Invalidate any in-flight capture.
                    runtime.calibrating = False
                    runtime.collecting = None
                    runtime.collecting_details = None
                    runtime.model = runtime.candidate = None
                    runtime.points = []
                    runtime.validation_errors = []
                    runtime.calibration_viewport = None
                    runtime.locked = False
                    runtime.filter.reset()
                else:
                    if not runtime.packet()['ready']:
                        raise ValueError('먼저 눈을 여러 방향으로 움직여 눈 모델을 준비하세요')
                    if runtime.collecting is not None:
                        raise ValueError('이미 수집 중입니다')
                    runtime.session = secrets.token_hex(8)
                    runtime.calibrating = runtime.locked = True
                    runtime.points = []
                    runtime.validation_errors = []
                    runtime.calibration_viewport = viewport
                    runtime.report_viewport = viewport
                    runtime.report_model = None
                    runtime.model = runtime.candidate = None
                    runtime.filter.reset()
            return web.json_response({'session_id': runtime.session})
        if not runtime.calibrating or data.get('session_id') != session:
            raise ValueError('보정 세션이 만료되었습니다')
        if action == 'sample':
            index = number(data['index'], 0, 8, integer=True)
            if index != len(runtime.points):
                raise ValueError('지점 순서가 맞지 않습니다')
            raw, record = await capture_point(action, index, POINTS[index], session)
            if session != runtime.session:
                raise ValueError('보정이 취소되었습니다')
            runtime.points.append(raw)
            if len(runtime.points) == 9:
                try:
                    runtime.candidate = fit_calibration(runtime.points, POINTS)
                    runtime.report_model = runtime.candidate
                except ValueError as error:
                    record.update(passed=False, error=str(error))
                    runtime.points.pop()  # Let the operator retry or restart.
                    raise
            record['passed'] = True
            recording.event('calibration_sample', sample=record, model=runtime.report_model)
            return web.json_response({'collected': len(runtime.points)})
        if action == 'validate':
            if runtime.candidate is None:
                raise ValueError('9개 지점을 먼저 수집하세요')
            index = number(data['validation_index'], 0, len(VALIDATION_POINTS) - 1, integer=True)
            if index != len(runtime.validation_errors):
                raise ValueError('검증 지점 순서가 맞지 않습니다')
            target = VALIDATION_POINTS[index]
            raw, record = await capture_point(action, index, target, session)
            if session != runtime.session:
                raise ValueError('보정이 취소되었습니다')
            estimate = predict(runtime.candidate, raw)
            delta = estimate - target
            error = float(np.linalg.norm(delta))
            record.update(predicted=estimate.tolist(), error_norm=error, delta=delta.tolist(), passed=error <= .12)
            viewport = runtime.calibration_viewport
            if viewport:
                record['error_px'] = float(np.linalg.norm(delta * [viewport['width'], viewport['height']]))
            if error > .12:
                record['error'] = f'검증 오차 {error:.3f} > 0.120 · 같은 점 재시도 또는 9점부터 재보정'
                recording.event('validation_result', result=record)
                raise ValueError(record['error'])
            recording.event('validation_result', result=record)
            runtime.validation_errors.append(error)
            if index < len(VALIDATION_POINTS) - 1:
                return web.json_response({'calibrated': False, 'validation_error': error,
                                          'validation_collected': len(runtime.validation_errors)})
            runtime.model = runtime.candidate
            runtime.calibrating = False
            runtime.filter.reset()
            return web.json_response({'calibrated': True, 'validation_error': max(runtime.validation_errors or [error])})
        raise ValueError('알 수 없는 보정 명령')

    async def page(request):
        return web.FileResponse(HERE / 'web' / 'index.html')

    async def script(request):
        return web.FileResponse(HERE / 'web' / 'app.js')

    async def plan(request):
        return web.json_response(dict(points=POINTS, validation_points=VALIDATION_POINTS))

    async def status(request):
        times = [t for t in runtime.frame_times if time.monotonic() - t < 2]
        fps_now = (len(times) - 1) / (times[-1] - times[0]) if len(times) > 1 else 0.
        return web.json_response(dict(runtime.packet(), processing_ms=runtime.processing_ms,
            processing_fps=round(fps_now, 1), detection_quality=runtime.detection_quality,
            pupil_detected=runtime.pupil_detected, camera=runtime.camera_info,
            calibration_points=len(runtime.points), validation_points=len(runtime.validation_errors),
            recording=recording.state(),
            detector=dict(engine=runtime.config['engine'], settings=getattr(runtime.tracker, 'settings', {}),
                          focal_length=runtime.config['focal_length']),
            last_attempt={k: v for k, v in runtime.attempts[-1].items() if k not in ('samples', 'frames')} if runtime.attempts else None))

    async def report(request):
        model = runtime.report_model
        condition = None
        if len(runtime.points) == 9:
            inputs = np.asarray(runtime.points)
            condition = float(np.linalg.cond(features((inputs - inputs.mean(0)) / inputs.std(0))))
        return web.json_response(dict(engine=runtime.config['engine'], tracker_metadata=getattr(runtime.tracker, 'metadata', {}),
            detector_settings=getattr(runtime.tracker, 'settings', {}), source=str(source), config=runtime.config,
            camera=runtime.camera_info, viewport=runtime.report_viewport, model=model,
            design_condition=condition, attempts=runtime.attempts,
            calibrated=runtime.model is not None, validation_errors=runtime.validation_errors))

    async def preview(request):
        if runtime.jpg is None or time.monotonic() - runtime.received > .35:
            raise web.HTTPServiceUnavailable(text='최신 영상 없음')
        return web.Response(body=runtime.jpg, content_type='image/jpeg')

    async def record(request):
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError('JSON 객체를 입력하세요')
        action = data.get('action')
        async with runtime.lock:
            try:
                if action == 'start_log':
                    recording.start_log(snapshot())
                elif action == 'stop_log':
                    recording.stop_log()
                elif action == 'start_video':
                    if not runtime.connected or not runtime.received or time.monotonic() - runtime.received > .35:
                        raise ValueError('최신 카메라 영상이 들어온 뒤 녹화를 시작하세요')
                    size = [int(runtime.camera_info[key]) for key in ('capture_width', 'capture_height')]
                    await work(recording.start_video, snapshot(), size)
                elif action == 'stop_video':
                    await work(recording.stop_video)
                else:
                    raise ValueError('알 수 없는 기록 명령')
            except (OSError, cv2.error) as error:
                await work(recording.close)
                recording.error = f'파일 저장 실패: {error}'
                raise ValueError(recording.error)
        return web.json_response(recording.state())

    async def record_event(request):
        data = await request.json()
        if not isinstance(data, dict) or data.get('phase') not in ('fit', 'model', 'neutral', 'sample', 'validate', 'complete', 'cancel'):
            raise ValueError('유효한 화면 단계가 필요합니다')
        point = data.get('point')
        if point is not None:
            if not isinstance(point, list) or len(point) != 2:
                raise ValueError('목표 좌표가 필요합니다')
            point = [number(value, 0, 1) for value in point]
        message = data.get('message', '')
        if not isinstance(message, str) or len(message) > 1000:
            raise ValueError('화면 메시지는 최대 1000자입니다')
        index = data.get('index')
        if index is not None:
            index = number(index, 0, 8, integer=True)
        viewport = data.get('viewport')
        if not isinstance(viewport, dict) or set(viewport) != {'width', 'height'}:
            raise ValueError('화면 너비와 높이가 필요합니다')
        viewport = {key: number(value, 100, 20000, integer=True) for key, value in viewport.items()}
        recording.event('target_display', phase=data['phase'], index=index, point=point,
                        message=message, client_timestamp_ms=number(data['client_timestamp_ms'], 0, 1e15),
                        viewport=viewport, session_id=runtime.session)
        return web.json_response({'saved': recording.log is not None})

    async def archive(request):
        path = await work(recording.archive, request.match_info['identity'])
        return web.FileResponse(path, headers={'Content-Disposition': f'attachment; filename="{path.parent.name}.zip"'})

    async def camera_loop(executor):
        run = functools.partial(asyncio.get_running_loop().run_in_executor, executor)
        cap = None
        identity = None
        try:
            while not stopping.is_set():
                try:
                    if reconnect.is_set():
                        if cap is not None:
                            await run(cap.release)
                            cap = None
                        identity = None  # Explicit refresh may select a replugged USB port.
                        reconnect.clear()
                    if cap is None:
                        backend = cv2.CAP_AVFOUNDATION if sys.platform == 'darwin' and isinstance(source, int) else cv2.CAP_ANY
                        selected = await run(select_usb_camera, identity, source) if backend == cv2.CAP_AVFOUNDATION else None
                        if selected:
                            identity = selected['identity']
                        capture_source = selected['index'] if selected else source
                        # macOS must request camera permission on the main thread.
                        # ponytail: opening can stall HTTP; preauthorize then open in the worker if latency matters.
                        cap = cv2.VideoCapture(capture_source, backend)
                        if not await run(cap.isOpened):
                            raise RuntimeError(f'카메라 {source}를 열 수 없습니다. 번호 / macOS 카메라 권한을 확인하세요')
                        if isinstance(source, int):
                            for prop, value in ((cv2.CAP_PROP_FRAME_WIDTH, 320), (cv2.CAP_PROP_FRAME_HEIGHT, 240), (cv2.CAP_PROP_FPS, 30)):
                                await run(cap.set, prop, value)
                        runtime.camera_info = dict(source=str(capture_source), device=selected,
                            mode='video' if isinstance(source, str) else 'camera',
                            requested_size=[320, 240] if isinstance(source, int) else None,
                            capture_width=await run(cap.get, cv2.CAP_PROP_FRAME_WIDTH),
                            capture_height=await run(cap.get, cv2.CAP_PROP_FRAME_HEIGHT),
                            reported_fps=await run(cap.get, cv2.CAP_PROP_FPS))
                        async with runtime.lock:
                            runtime.reset()
                            runtime.connected = True
                    started = time.monotonic()
                    ok, image = await run(cap.read)
                    captured_s = time.monotonic()
                    if not ok:
                        if isinstance(source, str):
                            await run(cap.set, cv2.CAP_PROP_POS_FRAMES, 0)
                            ok, image = await run(cap.read)
                            captured_s = time.monotonic()
                        if not ok:
                            raise RuntimeError('카메라 프레임 읽기 실패 · 재연결 대기')
                    async with runtime.lock:
                        processing_started = time.monotonic()
                        runtime.camera_info.update(capture_width=image.shape[1], capture_height=image.shape[0])
                        result = await run(runtime.analyze, image)
                        # Match the detector's own 4:3 crop so the overlay aligns at any negotiated camera size.
                        work = runtime.tracker.crop_to_aspect_ratio(image)
                        if runtime.config['flip']:
                            work = cv2.flip(work, -1)
                        pupil = result.get('pupil_ellipse') if result else None
                        if pupil:
                            color = (80, 230, 80) if result['confidence'] >= runtime.config['confidence'] else (0, 180, 255)
                            cv2.ellipse(work, (tuple(pupil['center']), tuple(pupil['axes']), pupil['angle_degrees']), color, 2)
                        encoded_ok, jpg = await run(cv2.imencode, '.jpg', work, [cv2.IMWRITE_JPEG_QUALITY, 80])
                        runtime.accept(result, jpg.tobytes() if encoded_ok else None)
                        runtime.processing_ms = round((time.monotonic() - processing_started) * 1000, 1)
                        model = runtime.model or runtime.candidate
                        prediction = predict(model, runtime.raw).tolist() if recording.log is not None and model and runtime.raw is not None else None
                        recording.event('frame', seq=runtime.seq, session_id=runtime.session,
                            capture_return_monotonic_s=captured_s, processed_monotonic_s=runtime.received,
                            detection=result, raw=runtime.raw, xy_unfiltered=prediction, xy_filtered=runtime.xy,
                            tracking=runtime.raw is not None, ready=runtime.ready, locked=runtime.locked,
                            calibrated=runtime.model is not None, calibrating=runtime.calibrating,
                            processing_ms=runtime.processing_ms, error=runtime.error,
                            video_file=recording.video_file if recording.video is not None else None,
                            video_frame_index=recording.frame_count if recording.video is not None else None)
                        try:
                            if recording.video is not None:
                                await run(recording.write_video, image, runtime.seq, captured_s, runtime.received)
                        except (OSError, ValueError, cv2.error) as error:
                            await run(recording.close)
                            recording.error = f'영상 저장 실패: {error}'
                    await asyncio.sleep(max(0, 1 / fps - (time.monotonic() - started)))
                except (RuntimeError, ValueError, cv2.error, subprocess.SubprocessError, OSError) as error:
                    LOG.warning('%s', error)
                    recording.event('camera_error', error=str(error), session_id=runtime.session)
                    async with runtime.lock:
                        runtime.reset()
                        runtime.connected = False
                        runtime.error = str(error)
                    if cap is not None:
                        await run(cap.release)
                        cap = None
                    await asyncio.sleep(1)
        finally:
            if cap is not None:
                await run(cap.release)

    async def lifecycle(app):
        task = asyncio.create_task(camera_loop(executor)) if camera_enabled else None
        try:
            yield
        finally:
            stopping.set()
            if task is not None:
                await task  # Finish an in-flight capture before releasing its device on the same thread.
            await work(recording.close)
            executor.shutdown(wait=True)

    app.cleanup_ctx.append(lifecycle)
    app.add_routes([web.get('/', page), web.get('/app.js', script), web.get('/api/plan', plan),
                    web.get('/api/status', status), web.get('/api/report', report),
                    web.post('/api/camera/refresh', refresh_camera),
                    web.post('/api/detector', detector_settings),
                    web.post('/api/recording', record), web.post('/api/recording/event', record_event),
                    web.get('/api/recording/{identity}.zip', archive),
                    web.get('/preview.jpg', preview), web.post('/api/calibration', calibration)])
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--camera', type=int, default=0, help='여러 USB 카메라 중 선택할 OpenCV 번호')
    parser.add_argument('--engine', choices=('orlosky', 'pupil-2d', 'pupil-3d', 'pure', 'pure-3d', 'else'), default='pure')
    parser.add_argument('--focal-length', type=float, default=560., help='3D 모델 초점거리 (640px 작업 영상); 실측하지 않은 기본값')
    parser.add_argument('--video', help='카메라 대신 반복 재생할 눈 영상 (정확도 측정용 아님)')
    parser.add_argument('--port', type=int, default=8090)
    parser.add_argument('--fps', type=int, choices=range(10, 31), default=20)
    parser.add_argument('--flip', action='store_true', help='기존 Mac 설정처럼 180도 회전')
    parser.add_argument('--confidence', type=float, default=.65)
    parser.add_argument('--smoothing-ms', type=float, default=80)
    parser.add_argument('--max-speed', type=float, default=4.)
    args = parser.parse_args()
    config = dict(flip=args.flip, confidence=number(args.confidence, .1, 1), engine=args.engine,
                  focal_length=number(args.focal_length, 100, 3000),
                  smoothing_ms=number(args.smoothing_ms, 10, 500), max_speed=number(args.max_speed, .1, 20))
    if args.camera < 0 or not 1 <= args.port <= 65535:
        parser.error('카메라는 0 이상, 포트는 1–65535 범위입니다')
    if args.video and not Path(args.video).is_file():
        parser.error('눈 영상 경로를 확인하세요')
    logging.basicConfig(level=logging.INFO)
    print(f'카메라 정확도 테스트: http://localhost:{args.port}')
    web.run_app(create_app(config, source=args.video or args.camera, fps=args.fps),
                host='127.0.0.1', port=args.port, access_log=None)


if __name__ == '__main__':
    main()
