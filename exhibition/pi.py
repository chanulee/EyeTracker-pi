"""Headless USB/V4L2 camera sender with a remotely operated settings page."""
import argparse
import asyncio
import base64
import contextlib
from collections import deque
import hmac
import logging
import os
from pathlib import Path
import secrets
import socket
import threading
import time

import aiohttp
from aiohttp import web
import cv2

from .common import load_config, number, receiver_url, save_config
from .camera_device import select_camera

LOG = logging.getLogger('eye-pi')
DEFAULTS = dict(receiver='ws://mac-mini.local:8080/camera', token='', camera=0,
                width=320, height=240, fps=20, quality=65, flip=False, transport='auto', camera_mode='auto', admin_password='')


def jpeg_size(data):
    """Read JPEG frame dimensions without decoding pixels on the Pi."""
    if len(data) < 4 or data[:2] != b'\xff\xd8':
        return None
    i = 2
    while i + 3 < len(data):
        if data[i] != 255:
            return None
        while i < len(data) and data[i] == 255:
            i += 1
        if i >= len(data):
            return None
        marker = data[i]
        i += 1
        if marker in (0xd9, 0xda):
            return None
        if marker == 0x01 or 0xd0 <= marker <= 0xd8:
            continue
        size = int.from_bytes(data[i:i + 2], 'big')
        if size < 2 or i + size > len(data):
            return None
        if marker in (0xc0, 0xc1, 0xc2):
            if size < 8:
                return None
            return (int.from_bytes(data[i + 5:i + 7], 'big'), int.from_bytes(data[i + 3:i + 5], 'big'))
        i += size
    return None


def capture_settings(config):
    return tuple(config.get(key) for key in ('camera', 'camera_mode', 'width', 'height', 'flip', 'transport'))


class FrameRateGate:
    """Keep fractional camera/output rates without rounding down to every Nth frame."""
    def __init__(self, fps):
        self.period = 1 / fps
        self.due = None

    def accept(self, now):
        if self.due is None:
            self.due = now + self.period
            return True
        if now + 1e-6 < self.due:
            return False
        self.due += (max(0, int((now - self.due) / self.period)) + 1) * self.period
        return True


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('JSON 객체를 입력하세요')
    if set(data) - (set(DEFAULTS) - {'admin_password'}):
        raise ValueError('알 수 없는 설정')
    result = dict(data)
    if 'camera_mode' in data and data['camera_mode'] not in ('auto', 'manual'):
        raise ValueError('카메라 선택은 auto 또는 manual입니다')
    if 'transport' in data and data['transport'] not in ('auto', 'decoded'):
        raise ValueError('영상 전송 방식은 auto 또는 decoded입니다')
    if 'receiver' in data:
        result['receiver'] = receiver_url(data['receiver'])
    if 'token' in data and (not isinstance(data['token'], str) or len(data['token']) < 16):
        raise ValueError('Pi 영상 전송 토큰은 16자 이상이어야 합니다')
    for key, bounds in dict(camera=(0, 20), width=(160, 640), height=(120, 480),
                            fps=(1, 30), quality=(30, 90)).items():
        if key in data:
            result[key] = number(data[key], *bounds, integer=True)
    if 'flip' in data and not isinstance(data['flip'], bool):
        raise ValueError('flip은 boolean이어야 합니다')
    return result


class Camera:
    def __init__(self, config):
        self.config = dict(config)
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.latest = None
        self.sequence = 0
        self.status = '카메라 시작 중'
        self.capture_info = dict(capture_width=None, capture_height=None, camera_reported_fps=None,
                                 fps_request_accepted=None, transport_mode='대기', transport_note=None)
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.native_failed = None
        self.device_identity = None
        self.selection = (self.config['camera'], self.config.get('camera_mode', 'auto'))
        self.progress = time.monotonic()
        self.retry_count = 0
        self.recoveries = 0
        self.capture_times = deque(maxlen=90)
        self.output_times = deque(maxlen=90)

    def snapshot(self):
        with self.lock:
            return self.sequence, self.latest, self.status

    def diagnostics(self):
        with self.lock:
            native = self.capture_info['transport_mode'] == 'camera-mjpeg'
            def fps(history):
                times = [t for t in history if time.monotonic() - t < 2]
                return round((len(times) - 1) / (times[-1] - times[0]), 1) if len(times) > 1 and times[-1] > times[0] else 0.
            return dict(self.capture_info, output_width=self.capture_info['capture_width'] if native else self.config['width'],
                        output_height=self.capture_info['capture_height'] if native else self.config['height'],
                        captured_fps=fps(self.capture_times), output_fps=fps(self.output_times),
                        requested_fps=self.config['fps'], camera_requested_fps=30,
                        camera_retry_count=self.retry_count, camera_recoveries=self.recoveries)

    def run(self):
        while not self.stop.is_set():
            settings = dict(self.config)
            selection = (settings['camera'], settings.get('camera_mode', 'auto'))
            if selection != self.selection:
                self.device_identity = None
                self.selection = selection
            geometry = capture_settings(settings)
            native = settings['transport'] == 'auto' and not settings['flip'] and self.native_failed != geometry
            cap = None
            failed = False
            self.progress = time.monotonic()
            try:
                device = select_camera(settings, self.device_identity)
                with self.lock:
                    self.capture_info.update(camera_device=device['path'], camera_node=device['node'],
                                             camera_name=device['name'], camera_bus=device['bus'], camera_state='opening')
                cap = cv2.VideoCapture(device['path'], cv2.CAP_V4L2)
                if not cap.isOpened():
                    raise RuntimeError(f"카메라를 열 수 없습니다: {device['node']}. 자동 재시도합니다")
                if native:
                    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, settings['width'])
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, settings['height'])
                # The UI FPS is a hot output limit, not a repeated USB mode negotiation.
                fps_accepted = cap.set(cv2.CAP_PROP_FPS, 30)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                if native and not cap.set(cv2.CAP_PROP_CONVERT_RGB, 0):
                    self.native_failed = geometry
                    continue  # Reopen normally when raw JPEG capture is unsupported.
                reported_fps = cap.get(cv2.CAP_PROP_FPS)
                with self.lock:
                    self.capture_info.update(camera_reported_fps=reported_fps if reported_fps > 0 else None,
                                             fps_request_accepted=bool(fps_accepted))
                gate = FrameRateGate(settings['fps'])
                gate_fps = settings['fps']
                while not self.stop.is_set() and geometry == capture_settings(self.config):
                    self.progress = time.monotonic()
                    ok, frame = cap.read()
                    if not ok:
                        raise RuntimeError('카메라 프레임 읽기 실패')
                    jpg = None
                    if native:
                        jpg = frame.tobytes()
                        dimensions = jpeg_size(jpg)
                        if not dimensions or not (0 < dimensions[0] <= 640 and 0 < dimensions[1] <= 480):
                            self.native_failed = geometry
                            break  # Retry decoded capture; never send a raw pixel buffer as JPEG.
                    else:
                        dimensions = (frame.shape[1], frame.shape[0])
                    with self.lock:
                        self.capture_times.append(time.monotonic())
                        self.capture_info.update(capture_width=dimensions[0], capture_height=dimensions[1],
                                                 transport_mode='camera-mjpeg' if native else 'pi-jpeg',
                                                 transport_note=None if native else 'Pi에서 JPEG 인코딩 (MJPEG 미지원 또는 회전/수동 모드)')
                    now = time.monotonic()
                    self.progress = now
                    if self.config['fps'] != gate_fps:
                        gate_fps = self.config['fps']
                        gate = FrameRateGate(gate_fps)
                    if not gate.accept(now):
                        continue
                    if native:
                        ok = True
                    else:
                        if dimensions != (settings['width'], settings['height']):
                            frame = cv2.resize(frame, (settings['width'], settings['height']))
                        if settings['flip']:
                            frame = cv2.flip(frame, -1)
                        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                        ok, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, self.config['quality']])
                        jpg = encoded.tobytes() if ok else None
                    if ok:
                        with self.lock:
                            self.sequence += 1
                            self.output_times.append(now)
                            self.latest = (now, jpg)
                            self.status = '카메라 정상'
                            self.capture_info['camera_state'] = 'streaming'
                            if self.retry_count:
                                self.recoveries += 1
                                self.retry_count = 0
                            self.device_identity = device['identity']
            except Exception as error:
                LOG.warning('%s', error)
                failed = True
                self.native_failed = None  # A USB outage is not proof that MJPEG is unsupported.
                with self.lock:
                    self.retry_count += 1
                    self.latest = None
                    self.status = str(error)
                    self.capture_info.update(capture_width=None, capture_height=None, camera_reported_fps=None,
                                             fps_request_accepted=None, transport_mode='대기', transport_note=None,
                                             camera_state='retrying')
            finally:
                if cap is not None:
                    cap.release()
            if failed:
                self.stop.wait(2)  # Release the driver before waiting/re-enumerating USB nodes.


async def watchdog(camera):
    """Let systemd restart a process whose capture thread is stuck in a driver call."""
    address = os.environ.get('NOTIFY_SOCKET')
    if not address:
        return
    if address.startswith('@'):
        address = '\0' + address[1:]
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as notifier:
        notifier.setblocking(False)
        while True:
            if camera.thread.is_alive() and time.monotonic() - camera.progress < 15:
                with contextlib.suppress(OSError):
                    notifier.sendto(b'WATCHDOG=1', address)
            await asyncio.sleep(5)


def create_app(config_path):
    config = load_config(config_path, DEFAULTS)
    if not config['admin_password']:
        config['admin_password'] = secrets.token_urlsafe(24)
        save_config(config_path, config)
    camera = Camera(config)
    connection = {'connected': False, 'message': 'Mac 연결 설정을 입력하세요'}
    active = None

    @web.middleware
    async def auth(request, handler):
        expected = 'Basic ' + base64.b64encode(('admin:' + config['admin_password']).encode()).decode()
        if not hmac.compare_digest(request.headers.get('Authorization', ''), expected):
            raise web.HTTPUnauthorized(headers={'WWW-Authenticate': 'Basic realm="Eye Pi"'})
        if request.method != 'GET' and request.headers.get('Origin') != f'{request.scheme}://{request.host}':
            raise web.HTTPForbidden(text='같은 Pi 설정 페이지에서 저장하세요')
        response = await handler(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    app = web.Application(middlewares=[auth], client_max_size=8192)

    async def page(request):
        return web.FileResponse(Path(__file__).parent / 'web' / 'pi.html')

    async def settings(request):
        return web.json_response({k: v for k, v in config.items() if k != 'admin_password'})

    async def update(request):
        nonlocal active
        try:
            data = validate(await request.json())
        except (ValueError, TypeError, AttributeError) as error:
            raise web.HTTPBadRequest(text=str(error))
        updated = dict(config, **data)
        reconnect = any(updated[key] != config[key] for key in
                        ('receiver', 'token', 'camera', 'camera_mode', 'width', 'height', 'flip', 'transport'))
        save_config(config_path, updated)
        config.update(data)
        camera.config = dict(config)
        if active and reconnect:
            await active.close()
        return web.json_response({'saved': True, 'reconnected': reconnect})

    async def status(request):
        seq, latest, message = camera.snapshot()
        return web.json_response(dict(connection, hostname=socket.gethostname(), camera=message, sequence=seq,
                                     frame_age_ms=round((time.monotonic() - latest[0]) * 1000) if latest else None,
                                     **camera.diagnostics()))

    async def preview(request):
        _, latest, _ = camera.snapshot()
        if not latest or time.monotonic() - latest[0] > 1:
            raise web.HTTPServiceUnavailable(text='카메라 영상 없음')
        return web.Response(body=latest[1], content_type='image/jpeg', headers={'Cache-Control': 'no-store'})

    async def sender():
        nonlocal active
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None, sock_connect=5)) as session:
            while True:
                try:
                    if len(config['token']) < 16:
                        await asyncio.sleep(1)
                        continue
                    _, latest, _ = camera.snapshot()
                    if not latest or time.monotonic() - latest[0] > .35:
                        connection.update(connected=False, message='카메라 복구 대기 · 저장된 Mac 설정은 유지합니다')
                        await asyncio.sleep(.5)
                        continue
                    async with session.ws_connect(config['receiver'], headers={'Authorization': 'Bearer ' + config['token']},
                                                  heartbeat=10, max_msg_size=1024) as ws:
                        active = ws
                        connection.update(connected=True, message='Mac 연결됨')
                        last_sequence = -1
                        while not ws.closed:
                            seq, latest, _ = camera.snapshot()
                            if latest is None:
                                raise RuntimeError('카메라 연결이 끊겨 보정 세션을 초기화합니다')
                            if seq == last_sequence or not latest or time.monotonic() - latest[0] > .35:
                                await asyncio.sleep(.01)
                                continue
                            # One frame in flight: Mac ACKs only after processing; never queue old images.
                            await ws.send_bytes(latest[1])
                            reply = await asyncio.wait_for(ws.receive(), 3)
                            if reply.type != aiohttp.WSMsgType.TEXT or reply.data != 'ack':
                                raise RuntimeError('Mac ACK 없음')
                            last_sequence = seq
                except (aiohttp.ClientError, OSError, asyncio.TimeoutError, RuntimeError, ValueError):
                    connection.update(connected=False, message='Mac 연결 실패; 주소/토큰/방화벽 확인 (2초 후 재시도)')
                finally:
                    active = None
                    connection['connected'] = False
                await asyncio.sleep(2)

    async def lifecycle(app):
        camera.thread.start()
        task = asyncio.create_task(sender())
        supervisor = asyncio.create_task(watchdog(camera))
        yield
        task.cancel()
        supervisor.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        with contextlib.suppress(asyncio.CancelledError):
            await supervisor
        camera.stop.set()
        await asyncio.to_thread(camera.thread.join, 3)

    app.cleanup_ctx.append(lifecycle)
    app.add_routes([web.get('/', page), web.get('/api/config', settings), web.post('/api/config', update),
                    web.get('/api/status', status), web.get('/preview.jpg', preview)])
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='exhibition/pi-config.json')
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    app = create_app(args.config)
    print(f'Pi UI: http://{socket.gethostname()}.local:{args.port} (사용자 admin; 비밀번호: {args.config}의 admin_password)')
    web.run_app(app, host=args.host, port=args.port, access_log=None)


if __name__ == '__main__':
    main()
