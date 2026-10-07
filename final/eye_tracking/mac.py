"""Pi JPEG receiver, headless upstream tracker, calibration, and browser WebSocket API."""
import argparse
import asyncio
import contextlib
import hmac
import importlib.util
import logging
import os
from pathlib import Path
import secrets
import sys
import time
from collections import deque
from urllib.parse import urlsplit

from aiohttp import web, WSMsgType, ClientSession, ClientTimeout, ClientError
import cv2
import numpy as np

from .common import load_config, number, save_config
from .gaze import POINTS, VALIDATION_POINTS, Stabilizer, fit_calibration, predict

RUNTIME_KEY = web.AppKey('runtime', object)
HERE = Path(__file__).parent
LOG = logging.getLogger('eye-mac')
DEFAULTS = dict(token='', gaze_token='', require_gaze_token=False, allowed_origins=[], smoothing_ms=80, max_speed=4., confidence=.65, flip=False)


def load_tracker():
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
    def __init__(self, config, tracker=None, user_id=1):
        self.simulate = False
        self.user_id = number(user_id, 1, 2, integer=True)
        self.config = config
        self.tracker = tracker
        self.lock = asyncio.Lock()  # All tracker globals are owned by this single worker.
        self.filter = Stabilizer()
        self.receiver = None
        self.clients = set()
        self.jpg = None
        self.received = 0.
        self.seq = 0
        self.frame_times = deque(maxlen=60)
        self.processing_ms = None
        self.error = 'Pi 연결 대기'
        self.reset()

    def reset(self):
        self.session = secrets.token_hex(8)
        self.model = self.candidate = None
        self.points = []
        self.validation_errors = []
        self.calibration_viewport = None
        self.collecting = None
        self.calibrating = False
        self.allow_inaccurate = False
        self.raw = self.direction = self.origin = self.pupil = self.xy = None
        self.confidence = 0.
        self.detection_quality = 0.
        self.pupil_detected = False
        self.pupil_candidate = None
        self.tracker_details = dict(getattr(self.tracker, 'metadata', {}))
        self.direction_history = deque(maxlen=90)
        self.neutral_direction = None
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
                    camera_connected=self.receiver is not None or self.simulate, error=self.error,
                    input_kind=self.tracker_details.get('input_kind', 'optical_axis'),
                    direction_frame=self.tracker_details.get('direction_frame'),
                    origin_unit=self.tracker_details.get('origin_unit'),
                    relative_angles=self.angles() if tracking else None,
                    calibration_viewport=self.calibration_viewport if self.model else None)

    def angles(self):
        if self.direction is None or self.neutral_direction is None:
            return None
        from .tracking.pupil3d import relative_angles
        return relative_angles(self.direction, self.neutral_direction)

    def set_neutral(self):
        if not self.packet()['ready'] or self.tracker_details.get('engine') != 'pupil':
            raise ValueError('Pupil 3D 눈 모델 준비 후 정면을 보세요')
        window = [(stamp, direction) for stamp, direction in self.direction_history if time.monotonic() - stamp < 1]
        if len(window) < 12 or window[-1][0] - window[0][0] < .8:
            raise ValueError('정면을 1초 이상 보세요. 유효 방향이 부족합니다')
        samples = np.asarray([direction for _, direction in window])
        center = np.median(samples, axis=0)
        center /= np.linalg.norm(center)
        if np.percentile(np.degrees(np.arccos(np.clip(samples @ center, -1, 1))), 90) > 5:
            raise ValueError('정면을 유지하세요. 방향이 흔들렸습니다')
        from .tracking.pupil3d import relative_angles
        relative_angles(center, center)  # Validate the reference before saving it.
        self.neutral_direction = center.tolist()

    def analyze(self, jpg):
        if self.reset_pending:
            self.tracker.reset_tracking_state()
            self.reset_pending = False
        self.tracker.eye_sphere_adjustment_enabled = not self.locked
        image = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
        if image is None or image.shape[0] > 480 or image.shape[1] > 640:
            raise ValueError('JPEG는 최대 640×480이어야 합니다')
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
        if direction is not None:
            self.direction_history.append((now, direction))
        self.error = None
        if self.collecting is not None:
            self.collecting.append(self.raw.copy())
        self.xy = self.filter.update(predict(self.model, self.raw), now,
                                     self.config['smoothing_ms'] / 1000, self.config['max_speed']) if self.model else None

    async def capture(self):
        if self.collecting is not None:
            raise ValueError('이미 수집 중입니다')
        samples = []
        self.collecting = samples
        try:
            await asyncio.sleep(1.2)
            if self.tracker_details.get('engine') == 'deepvog-verified':
                deadline = time.monotonic() + 2.8
                while len(samples) < 12 and time.monotonic() < deadline and self.collecting is samples:
                    await asyncio.sleep(.1)
        finally:
            if self.collecting is samples:
                self.collecting = None
        if not self.packet()['tracking'] or len(samples) < 12:
            raise ValueError('유효 프레임이 부족합니다. 동공/조명/연결을 확인하세요')
        samples = np.asarray(samples)
        median = np.median(samples, axis=0)
        if not self.allow_inaccurate and np.percentile(np.linalg.norm(samples - median, axis=1), 90) > .08:
            raise ValueError('시선이 흔들렸습니다. 같은 점을 다시 보세요')
        return median.tolist()


def create_app(config_path, simulate=False, tracker=None, user_id=1, peer_port=8081):
    config = load_config(config_path, DEFAULTS)
    if not config['token'] or not config['gaze_token']:
        config['token'] = config['token'] or secrets.token_urlsafe(32)
        config['gaze_token'] = config['gaze_token'] or secrets.token_urlsafe(32)
        save_config(config_path, config)
    runtime = Runtime(config, tracker if tracker is not None else (None if simulate else load_tracker()), user_id)

    def local(request):
        hostname = urlsplit('http://' + request.host).hostname
        if request.remote not in ('127.0.0.1', '::1') or hostname not in ('localhost', '127.0.0.1', '::1'):
            raise web.HTTPForbidden(text='Mac에서 localhost로 설정 페이지를 열어주세요')
        if request.method != 'GET' and request.headers.get('Origin') != f'{request.scheme}://{request.host}':
            raise web.HTTPForbidden(text='같은 설정 페이지에서 요청하세요')

    @web.middleware
    async def errors(request, handler):
        try:
            response = await handler(request)
            if not response.prepared:
                response.headers['Cache-Control'] = 'no-store'
            return response
        except (ValueError, TypeError, KeyError) as error:
            raise web.HTTPBadRequest(text=str(error))

    app = web.Application(middlewares=[errors], client_max_size=8192)
    runtime.simulate = simulate
    app[RUNTIME_KEY] = runtime

    async def page(request):
        local(request)
        return web.FileResponse(HERE / 'web' / 'index.html')

    async def admin(request):
        local(request)
        return web.FileResponse(HERE / 'web' / 'admin.html')

    async def stage(request):
        local(request)
        return web.FileResponse(HERE / 'web' / 'stage.html')

    async def exhibition_info(request):
        local(request)
        from .startup import server_settings, lan_address
        address = await asyncio.to_thread(lan_address)
        address = None if address == 'Mac의LAN주소' else address
        return web.json_response(dict(server_settings(), lan_address=address, players=[
            {'user_id': user, 'receiver_url': f'ws://{address}:{port}/camera' if address else None}
            for user, port in ((1, 8080),)]))

    async def peer(request):
        # Only a fixed local worker and a small management allowlist are reachable.
        local(request)
        if runtime.user_id != 1:
            raise web.HTTPNotFound()
        resource = request.match_info['resource']
        paths = {'status': '/api/status', 'config': '/api/config', 'preview': '/preview.jpg',
                 'calibration': '/api/calibration'}
        if resource not in paths or (request.method == 'POST' and resource not in ('config', 'calibration')):
            raise web.HTTPNotFound()
        target = f'http://127.0.0.1:{peer_port}'
        try:
            async with ClientSession(timeout=ClientTimeout(total=4)) as session:
                preview_query = '?overlay=1' if resource == 'preview' and request.query.get('overlay') == '1' else ''
                async with session.request(request.method, target + paths[resource] + preview_query,
                                           data=await request.read() if request.method == 'POST' else None,
                                           headers={'Origin': target, 'Content-Type': 'application/json'},
                                           allow_redirects=False) as response:
                    return web.Response(status=response.status, body=await response.read(),
                                        content_type=response.content_type)
        except (ClientError, asyncio.TimeoutError):
            raise web.HTTPServiceUnavailable(text='2P 서버 연결 실패. --two-users로 시작했는지 확인하세요')

    async def client(request):
        return web.FileResponse(HERE / 'web' / 'gaze-client.js')

    async def settings(request):
        local(request)
        return web.json_response(config)

    async def update(request):
        local(request)
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError('JSON 객체를 입력하세요')
        if set(data) - {'allowed_origins', 'smoothing_ms', 'max_speed', 'confidence', 'flip', 'require_gaze_token'}:
            raise ValueError('알 수 없는 설정')
        result = dict(config)
        if 'require_gaze_token' in data:
            if not isinstance(data['require_gaze_token'], bool):
                raise ValueError('require_gaze_token은 boolean이어야 합니다')
            result['require_gaze_token'] = data['require_gaze_token']
        for key, bounds in dict(smoothing_ms=(10, 500), max_speed=(.1, 20), confidence=(.1, 1)).items():
            if key in data:
                result[key] = number(data[key], *bounds)
        if 'flip' in data:
            if not isinstance(data['flip'], bool):
                raise ValueError('flip은 boolean이어야 합니다')
            result['flip'] = data['flip']
        if 'allowed_origins' in data:
            origins = data['allowed_origins']
            if not isinstance(origins, list) or len(origins) > 20:
                raise ValueError('Origin은 최대 20개입니다')
            for origin in origins:
                if not isinstance(origin, str):
                    raise ValueError('Origin은 문자열이어야 합니다')
                parsed = urlsplit(origin)
                if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username
                        or parsed.password or parsed.path or parsed.query or parsed.fragment):
                    raise ValueError('Origin은 http://localhost:3000처럼 경로 없이 입력하세요')
                _ = parsed.port
            result['allowed_origins'] = origins
        save_config(config_path, result)
        token_policy_changed = result['require_gaze_token'] != config['require_gaze_token']
        async with runtime.lock:
            geometry_changed = result['flip'] != config['flip'] or result['confidence'] != config['confidence']
            config.update(result)
            if geometry_changed:
                runtime.reset()
            runtime.filter.reset()
        if token_policy_changed:
            for ws in list(runtime.clients):
                await ws.close(code=1008, message=b'Subscription policy changed')
        return web.json_response({'saved': True})

    async def status(request):
        local(request)
        times = [t for t in runtime.frame_times if time.monotonic() - t < 2]
        fps = (len(times) - 1) / (times[-1] - times[0]) if len(times) > 1 else 0.
        return web.json_response(dict(runtime.packet(), simulate=simulate, calibration_points=len(runtime.points),
                                      pupil_detected=runtime.pupil_detected and time.monotonic() - runtime.received < .35,
                                      detection_quality=runtime.detection_quality,
                                      tracker_details=runtime.tracker_details,
                                      validation_points=len(runtime.validation_errors),
                                      neutral_set=runtime.neutral_direction is not None,
                                      subscribers=len(runtime.clients), processing_ms=runtime.processing_ms,
                                      processing_fps=round(fps, 1), calibrating=runtime.calibrating))

    async def preview(request):
        local(request)
        if runtime.jpg is None or time.monotonic() - runtime.received > .35:
            raise web.HTTPServiceUnavailable(text='최신 영상 없음')
        jpg = runtime.jpg
        if request.query.get('overlay') == '1':
            image = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
            if image is None:
                raise web.HTTPServiceUnavailable(text='영상 디코딩 실패')
            image = cv2.resize(image, (640, 480))
            if config['flip']:
                image = cv2.flip(image, -1)
            segmentation = getattr(runtime.tracker, 'segmentation', None)
            if segmentation is not None:
                mask = cv2.resize(segmentation, (640, 480), interpolation=cv2.INTER_NEAREST) > 0
                tint = np.full_like(image, (70, 210, 70))
                image[mask] = cv2.addWeighted(image, .7, tint, .3, 0)[mask]
            pupil = runtime.pupil_candidate
            if pupil:
                color = (80, 230, 80) if runtime.detection_quality >= config['confidence'] else (0, 180, 255)
                ellipse = (tuple(pupil['center']), tuple(pupil['axes']), pupil['angle_degrees'])
                cv2.ellipse(image, ellipse, color, 2)
                cv2.drawMarker(image, tuple(int(v) for v in pupil['center']), color, cv2.MARKER_CROSS, 12, 1)
            ok, encoded = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ok:
                jpg = encoded.tobytes()
        return web.Response(body=jpg, content_type='image/jpeg')

    async def camera(request):
        if simulate:
            raise web.HTTPConflict(text='시뮬레이션에서는 Pi 연결을 받지 않습니다')
        if not hmac.compare_digest(request.headers.get('Authorization', ''), 'Bearer ' + config['token']):
            raise web.HTTPUnauthorized()
        if runtime.receiver is not None:
            raise web.HTTPConflict(text='Pi 한 대만 연결할 수 있습니다')
        ws = web.WebSocketResponse(heartbeat=10, max_msg_size=512 * 1024)
        runtime.receiver = ws
        try:
            await ws.prepare(request)
            async with runtime.lock:
                runtime.reset()  # Reconnection may mean camera/visitor geometry changed.
            async for msg in ws:
                if msg.type == WSMsgType.BINARY:
                    async with runtime.lock:
                        try:
                            started = time.monotonic()
                            result = await asyncio.to_thread(runtime.analyze, msg.data)
                            runtime.processing_ms = round((time.monotonic() - started) * 1000, 1)
                            runtime.accept(result, msg.data)
                        except (ValueError, cv2.error, ArithmeticError) as error:
                            LOG.warning('Tracker frame rejected: %s', error)
                            runtime.accept(None)
                    await ws.send_str('ack')
                elif msg.type == WSMsgType.TEXT:
                    await ws.close(code=1003, message=b'JPEG binary required')
        finally:
            runtime.receiver = None
            async with runtime.lock:
                runtime.reset()
                runtime.jpg = None
                runtime.error = 'Pi 연결 끊김; 재연결 후 새 관람객 보정 필요'
        return ws

    async def gaze(request):
        if config['require_gaze_token'] and not hmac.compare_digest(request.query.get('token', ''), config['gaze_token']):
            raise web.HTTPUnauthorized(text='시선 구독 토큰이 필요합니다')
        origin = request.headers.get('Origin')
        own = f'{request.scheme}://{request.host}'
        local_stage = (runtime.user_id == 2 and request.remote in ('127.0.0.1', '::1')
                       and urlsplit(own).hostname in ('localhost', '127.0.0.1', '::1')
                       and origin == 'http://localhost:8080')
        if origin not in config['allowed_origins'] and not local_stage:
            if (origin != own or request.remote not in ('127.0.0.1', '::1')
                    or urlsplit(own).hostname not in ('localhost', '127.0.0.1', '::1')):
                raise web.HTTPForbidden(text='Mac 설정에 프론트엔드 Origin을 등록하세요')
        ws = web.WebSocketResponse(heartbeat=10)
        await ws.prepare(request)
        runtime.clients.add(ws)

        async def publish():
            try:
                while not ws.closed:
                    await asyncio.wait_for(ws.send_json(runtime.packet()), .5)
                    await asyncio.sleep(1 / 30)
            except (ConnectionError, asyncio.TimeoutError, RuntimeError):
                await ws.close()

        task = asyncio.create_task(publish())
        try:
            async for _ in ws:  # Consume ping/pong/close while publishing.
                pass
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            runtime.clients.discard(ws)
            await ws.close()
        return ws

    async def calibration(request):
        local(request)
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError('JSON 객체를 입력하세요')
        action = data['action']
        if action == 'neutral':
            async with runtime.lock:
                if data.get('session_id') and data['session_id'] != runtime.session:
                    raise ValueError('보정 세션이 만료되었습니다')
                runtime.set_neutral()
            return web.json_response({'neutral_set': True})
        session = runtime.session
        if action in ('reset', 'begin', 'cancel'):
            if action == 'begin' and not isinstance(data.get('allow_inaccurate', False), bool):
                raise ValueError('allow_inaccurate는 boolean이어야 합니다')
            viewport = data.get('viewport')
            if action == 'begin' and viewport is not None:
                if not isinstance(viewport, dict) or set(viewport) != {'width', 'height'}:
                    raise ValueError('화면 너비와 높이를 입력하세요')
                viewport = {key: number(value, 100, 20000, integer=True) for key, value in viewport.items()}
            async with runtime.lock:
                if action == 'reset':
                    runtime.reset()
                elif action == 'cancel':
                    if data.get('session_id') and data['session_id'] != runtime.session:
                        raise ValueError('보정 세션이 만료되었습니다')
                    runtime.session = secrets.token_hex(8)  # Invalidate any in-flight capture.
                    runtime.calibrating = False
                    runtime.collecting = None
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
                    runtime.allow_inaccurate = data.get('allow_inaccurate', False)
                    runtime.points = []
                    runtime.validation_errors = []
                    runtime.calibration_viewport = viewport
                    runtime.model = runtime.candidate = None
                    runtime.filter.reset()
            return web.json_response({'session_id': runtime.session})
        if not runtime.calibrating or data.get('session_id') != session:
            raise ValueError('보정 세션이 만료되었습니다')
        if action == 'sample':
            index = number(data['index'], 0, 8, integer=True)
            if index != len(runtime.points):
                raise ValueError('지점 순서가 맞지 않습니다')
            raw = await runtime.capture()
            if session != runtime.session:
                raise ValueError('보정이 취소되었습니다')
            runtime.points.append(raw)
            if len(runtime.points) == 9:
                try:
                    runtime.candidate = fit_calibration(runtime.points, POINTS, allow_inaccurate=runtime.allow_inaccurate)
                except ValueError:
                    runtime.points.pop()  # Let the operator retry or restart.
                    raise
            return web.json_response({'collected': len(runtime.points)})
        if action == 'validate':
            if runtime.candidate is None:
                raise ValueError('9개 지점을 먼저 수집하세요')
            index = data.get('validation_index')
            if index is not None:
                index = number(index, 0, len(VALIDATION_POINTS) - 1, integer=True)
                if index != len(runtime.validation_errors):
                    raise ValueError('검증 지점 순서가 맞지 않습니다')
            target = VALIDATION_POINTS[index] if index is not None else (.5, .5)
            raw = await runtime.capture()
            if session != runtime.session:
                raise ValueError('보정이 취소되었습니다')
            error = float(np.linalg.norm(predict(runtime.candidate, raw) - target))
            if not runtime.allow_inaccurate and error > .12:
                raise ValueError('검증 오차가 큽니다. 자세를 고정하고 같은 점을 다시 보세요')
            if index is not None:
                runtime.validation_errors.append(error)
                if index < len(VALIDATION_POINTS) - 1:
                    return web.json_response({'calibrated': False, 'validation_error': error,
                                              'validation_collected': len(runtime.validation_errors)})
            runtime.model = runtime.candidate
            runtime.calibrating = False
            runtime.filter.reset()
            return web.json_response({'calibrated': True, 'validation_error': max(runtime.validation_errors or [error])})
        raise ValueError('알 수 없는 보정 명령')

    async def calibration_plan(request):
        local(request)
        return web.json_response({'points': POINTS, 'validation_points': VALIDATION_POINTS})

    async def demo(request):
        local(request)
        if not simulate:
            raise web.HTTPNotFound()
        data = await request.json()
        if not isinstance(data, dict):
            raise ValueError('JSON 객체를 입력하세요')
        x, y = number(data['x'], 0, 1), number(data['y'], 0, 1)
        direction = [(x - .5) * .8, (.5 - y) * .8, 1.]
        direction = (np.asarray(direction) / np.linalg.norm(direction)).tolist()
        runtime.accept(dict(direction=direction, origin=[0, 0, 0], confidence=1., ready=True,
                            pupil_ellipse={'center': [x * 640, y * 480], 'axes': [70, 90], 'angle_degrees': 0}))
        return web.json_response({'ok': True})

    async def lifecycle(app):
        yield
        for ws in list(runtime.clients):
            await ws.close()
        if runtime.receiver:
            await runtime.receiver.close()

    app.cleanup_ctx.append(lifecycle)
    app.add_routes([web.get('/', page), web.get('/admin', admin), web.get('/stage', stage),
                    web.get('/api/exhibition', exhibition_info),
                    web.get('/api/player2/{resource}', peer), web.post('/api/player2/{resource}', peer),
                    web.get('/gaze-client.js', client), web.get('/api/config', settings),
                    web.post('/api/config', update), web.get('/api/status', status), web.get('/preview.jpg', preview),
                    web.get('/camera', camera), web.get('/gaze', gaze), web.post('/api/calibration', calibration),
                    web.get('/api/calibration-plan', calibration_plan),
                    web.post('/api/demo', demo)])
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='state/mac-config.json')
    parser.add_argument('--user-id', type=int, choices=(1, 2), default=1)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--simulate', action='store_true', help='마우스 입력으로 API/보정 테스트 (실제 시선 아님)')
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--tracker', choices=('deepvog-verified', 'orlosky', 'pupil'), default=os.environ.get('EYE_TRACKER', 'deepvog-verified'))
    parser.add_argument('--focal-length-px', type=float, default=os.environ.get('EYE_FOCAL_LENGTH_PX', '560'), help='640px 작업 영상의 초점거리 (기본값은 미측정 추정)')
    parser.add_argument('--intrinsics-measured', action='store_true', default=os.environ.get('EYE_INTRINSICS_MEASURED') == '1')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    if not args.worker:
        print(f'사용자 {args.user_id} Mac 운영 화면: http://localhost:{args.port}')
    tracker = None
    if args.tracker == 'deepvog-verified' and not args.simulate:
        sys.path.insert(0, str(HERE.parents[1]))
        from camera_accuracy.verified import VerifiedTracker
        tracker = VerifiedTracker()
    if args.tracker == 'pupil' and not args.simulate:
        from .tracking.pupil3d import PupilTracker
        tracker = PupilTracker(load_tracker(), number(args.focal_length_px, 100, 3000), args.intrinsics_measured)
    web.run_app(create_app(args.config, args.simulate, tracker=tracker, user_id=args.user_id), host=args.host, port=args.port,
                access_log=None, print=None if args.worker else print)


if __name__ == '__main__':
    main()
