"""Pi JPEG receiver, headless upstream tracker, calibration, and browser WebSocket API."""
import argparse
import asyncio
import contextlib
import hmac
import importlib.util
import logging
from pathlib import Path
import secrets
import time
from collections import deque
from urllib.parse import urlsplit

from aiohttp import web, WSMsgType, ClientSession, ClientTimeout, ClientError
import cv2
import numpy as np

from .common import load_config, number, save_config
from .gaze import POINTS, Stabilizer, fit_calibration, predict

RUNTIME_KEY = web.AppKey('runtime', object)
HERE = Path(__file__).parent
LOG = logging.getLogger('eye-mac')
DEFAULTS = dict(token='', gaze_token='', require_gaze_token=False, allowed_origins=[], smoothing_ms=80, max_speed=4., confidence=.65, flip=False)


def load_tracker():
    path = HERE / 'tracking' / 'Orlosky3DEyeTracker.py'
    spec = importlib.util.spec_from_file_location('orlosky', path)
    tracker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tracker)
    tracker.DISPLAY_ENABLED = False
    tracker.WRITE_GAZE_FILE = False
    tracker.GL_SPHERE_AVAILABLE = False
    return tracker


class Runtime:
    def __init__(self, config, tracker=None, user_id=1):
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
        self.collecting = None
        self.calibrating = False
        self.raw = self.direction = self.origin = self.pupil = self.xy = None
        self.confidence = 0.
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
                    camera_connected=self.receiver is not None, error=self.error)

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
        direction = result.get('direction') if result else None
        if (not direction or len(direction) != 3 or not np.isfinite(direction).all()
                or confidence < self.config['confidence'] or not result.get('pupil_ellipse')):
            self.raw = self.direction = self.origin = self.pupil = self.xy = None
            self.confidence = 0.
            self.filter.reset()
            self.error = '동공 검출 실패 또는 낮은 품질'
            return
        self.raw = [direction[0], direction[1]]
        self.direction, self.origin = direction, result.get('origin')
        self.pupil = result['pupil_ellipse']
        self.confidence = confidence
        self.ready = bool(result.get('ready', len(self.tracker.model_centers) >= 30
                                     and self.tracker.max_observed_distance > 0)) if self.tracker else result.get('ready', False)
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
        finally:
            if self.collecting is samples:
                self.collecting = None
        if not self.packet()['tracking'] or len(samples) < 12:
            raise ValueError('유효 프레임이 부족합니다. 동공/조명/연결을 확인하세요')
        samples = np.asarray(samples)
        median = np.median(samples, axis=0)
        if np.percentile(np.linalg.norm(samples - median, axis=1), 90) > .08:
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
                async with session.request(request.method, target + paths[resource],
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
                    raise ValueError('Origin은 http://localhost:5173처럼 경로 없이 입력하세요')
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
                                      subscribers=len(runtime.clients), processing_ms=runtime.processing_ms,
                                      processing_fps=round(fps, 1), calibrating=runtime.calibrating))

    async def preview(request):
        local(request)
        if runtime.jpg is None or time.monotonic() - runtime.received > .35:
            raise web.HTTPServiceUnavailable(text='최신 영상 없음')
        return web.Response(body=runtime.jpg, content_type='image/jpeg')

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
        session = runtime.session
        if action in ('reset', 'begin', 'cancel'):
            async with runtime.lock:
                if action == 'reset':
                    runtime.reset()
                elif action == 'cancel':
                    runtime.session = secrets.token_hex(8)  # Invalidate any in-flight capture.
                    runtime.calibrating = False
                    runtime.collecting = None
                    runtime.model = runtime.candidate = None
                    runtime.points = []
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
                    runtime.candidate = fit_calibration(runtime.points, POINTS)
                except ValueError:
                    runtime.points.pop()  # Let the operator retry or restart.
                    raise
            return web.json_response({'collected': len(runtime.points)})
        if action == 'validate':
            if runtime.candidate is None:
                raise ValueError('9개 지점을 먼저 수집하세요')
            raw = await runtime.capture()
            if session != runtime.session:
                raise ValueError('보정이 취소되었습니다')
            error = float(np.linalg.norm(predict(runtime.candidate, raw) - [.5, .5]))
            if error > .12:
                raise ValueError('중앙 검증 오차가 큽니다. 보정을 다시 시작하세요')
            runtime.model = runtime.candidate
            runtime.calibrating = False
            runtime.filter.reset()
            return web.json_response({'calibrated': True, 'validation_error': error})
        raise ValueError('알 수 없는 보정 명령')

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
                    web.get('/api/player2/{resource}', peer), web.post('/api/player2/{resource}', peer),
                    web.get('/gaze-client.js', client), web.get('/api/config', settings),
                    web.post('/api/config', update), web.get('/api/status', status), web.get('/preview.jpg', preview),
                    web.get('/camera', camera), web.get('/gaze', gaze), web.post('/api/calibration', calibration),
                    web.post('/api/demo', demo)])
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='exhibition/mac-config.json')
    parser.add_argument('--user-id', type=int, choices=(1, 2), default=1)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--simulate', action='store_true', help='마우스 입력으로 API/보정 테스트 (실제 시선 아님)')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    print(f'사용자 {args.user_id} Mac 운영 화면: http://localhost:{args.port}')
    web.run_app(create_app(args.config, args.simulate, user_id=args.user_id), host=args.host, port=args.port, access_log=None)


if __name__ == '__main__':
    main()
