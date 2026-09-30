"""Headless USB/V4L2 camera sender with a remotely operated settings page."""
import argparse
import asyncio
import base64
import contextlib
import hmac
import logging
from pathlib import Path
import secrets
import socket
import threading
import time

import aiohttp
from aiohttp import web
import cv2

from .common import load_config, number, receiver_url, save_config

LOG = logging.getLogger('eye-pi')
DEFAULTS = dict(receiver='ws://mac-mini.local:8080/camera', token='', camera=0,
                width=320, height=240, fps=20, quality=65, flip=False, admin_password='')


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('JSON 객체를 입력하세요')
    if set(data) - (set(DEFAULTS) - {'admin_password'}):
        raise ValueError('알 수 없는 설정')
    result = dict(data)
    if 'receiver' in data:
        result['receiver'] = receiver_url(data['receiver'])
    if 'token' in data and (not isinstance(data['token'], str) or len(data['token']) < 16):
        raise ValueError('Mac 연결 토큰은 16자 이상이어야 합니다')
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
        self.thread = threading.Thread(target=self.run, daemon=True)

    def snapshot(self):
        with self.lock:
            return self.sequence, self.latest, self.status

    def run(self):
        while not self.stop.is_set():
            settings = dict(self.config)
            cap = cv2.VideoCapture(settings['camera'], cv2.CAP_V4L2)
            try:
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, settings['width'])
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, settings['height'])
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                if not cap.isOpened():
                    raise RuntimeError('카메라를 열 수 없습니다. /dev/video 번호를 확인하세요')
                last = 0.
                while not self.stop.is_set() and settings == self.config:
                    ok, frame = cap.read()
                    if not ok:
                        raise RuntimeError('카메라 프레임 읽기 실패')
                    now = time.monotonic()
                    if now - last < 1 / settings['fps']:
                        continue
                    last = now
                    frame = cv2.resize(frame, (settings['width'], settings['height']))
                    if settings['flip']:
                        frame = cv2.flip(frame, -1)
                    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    ok, jpg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, settings['quality']])
                    if ok:
                        with self.lock:
                            self.sequence += 1
                            self.latest = (now, jpg.tobytes())
                            self.status = '카메라 정상'
            except Exception as error:
                LOG.warning('%s', error)
                with self.lock:
                    self.latest = None
                    self.status = str(error)
                self.stop.wait(2)
            finally:
                cap.release()


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
        save_config(config_path, updated)
        config.update(data)
        camera.config = dict(config)
        if active:
            await active.close()
        return web.json_response({'saved': True})

    async def status(request):
        seq, latest, message = camera.snapshot()
        return web.json_response(dict(connection, hostname=socket.gethostname(), camera=message, sequence=seq,
                                     frame_age_ms=round((time.monotonic() - latest[0]) * 1000) if latest else None))

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
                    async with session.ws_connect(config['receiver'], headers={'Authorization': 'Bearer ' + config['token']},
                                                  heartbeat=10, max_msg_size=1024) as ws:
                        active = ws
                        connection.update(connected=True, message='Mac 연결됨')
                        last_sequence = -1
                        while not ws.closed:
                            seq, latest, _ = camera.snapshot()
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
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
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
