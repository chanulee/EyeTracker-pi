"""Adapt the unchanged Pi stream dashboard to the existing Mac exhibition APIs."""
import argparse
import asyncio
import contextlib
import json
import logging
import math
from pathlib import Path
import time

from aiohttp import ClientError, ClientSession, ClientTimeout, MultipartReader, WSMsgType, web

LOG = logging.getLogger('stream-bridge')


def sensor_packet(state):
    """Keep stale/error samples invalid; do not manufacture an IMU orientation."""
    age = state.get('age_s')
    q = state.get('quaternion')
    imu_ok = (not state.get('error') and not state.get('stale')
              and isinstance(age, (int, float)) and 0 <= age < .75
              and isinstance(q, list) and len(q) == 4
              and all(isinstance(v, (int, float)) and math.isfinite(v) for v in q)
              and .95 <= math.sqrt(sum(v*v for v in q)) <= 1.05)
    mic = state.get('mic', {})
    return dict(mock=bool(state.get('mock')), imu=dict(
        status='ok' if imu_ok else 'unavailable', age=age,
        q=q if imu_ok else [0, 0, 0, 0],
        accel=state.get('accel'), gyro=state.get('gyro'), mag=state.get('mag')),
        mic=dict(status='ok' if mic.get('ready') else 'unavailable',
                 age=mic.get('age_s'), rms_db=mic.get('rms_db', -120),
                 peak_db=mic.get('peak_db', -120)))


async def camera_frames(response, queue):
    reader = MultipartReader.from_response(response)
    while True:
        part = await reader.next()
        if part is None:
            raise ConnectionError('Pi camera stream ended')
        # Match the existing Mac receiver limit and bound malformed upstream data.
        length = int(part.headers.get('Content-Length', '0'))
        if not 0 < length <= 512 * 1024:
            raise ValueError('Invalid JPEG frame length')
        data = bytes(await part.read())
        if len(data) != length:
            raise ValueError('Incomplete JPEG frame')
        if queue.full():
            queue.get_nowait()
        queue.put_nowait((time.monotonic(), data))


async def send_frames(ws, queue):
    while True:
        stamp, jpg = await queue.get()
        if time.monotonic() - stamp > .35:
            continue
        await ws.send_bytes(jpg)
        reply = await ws.receive(timeout=5)
        if reply.type != WSMsgType.TEXT or reply.data != 'ack':
            raise ConnectionError('Mac camera receiver disconnected')


async def relay_camera(session, pi_url, config_path, camera_url):
    while True:
        try:
            # The Mac owns the token; never expose it to Pi or the browser.
            token = json.loads(Path(config_path).read_text())['token']
            async with session.get(pi_url + '/camera.mjpg') as response:
                response.raise_for_status()
                async with session.ws_connect(camera_url, headers={'Authorization': 'Bearer ' + token}, heartbeat=10) as ws:
                    LOG.info('Pi MJPEG → Mac pupil worker connected')
                    queue = asyncio.Queue(maxsize=1)
                    tasks = [asyncio.create_task(camera_frames(response, queue)),
                             asyncio.create_task(send_frames(ws, queue))]
                    try:
                        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                        for task in done:
                            task.result()
                    finally:
                        for task in tasks:
                            task.cancel()
                        await asyncio.gather(*tasks, return_exceptions=True)
        except (OSError, ValueError, KeyError, asyncio.TimeoutError, ClientError) as error:
            LOG.warning('Camera retry in 2s: %s', error)
        await asyncio.sleep(2)


def create_app(pi_url, config_path, camera_url='ws://127.0.0.1:8080/camera'):
    pi_url = pi_url.rstrip('/')
    app = web.Application()
    session = None

    async def sensors(request):
        # Check before sending headers so the existing hub can report disconnects.
        async def snapshot():
            async with session.get(pi_url + '/state', timeout=ClientTimeout(total=2)) as response:
                response.raise_for_status()
                return sensor_packet(await response.json())
        try:
            packet = await snapshot()
        except (OSError, ValueError, asyncio.TimeoutError, ClientError):
            raise web.HTTPServiceUnavailable(text='Pi stream unavailable')
        response = web.StreamResponse(headers={'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store'})
        await response.prepare(request)
        try:
            while True:
                await response.write(('data: ' + json.dumps(packet) + '\n\n').encode())
                await asyncio.sleep(.1)
                packet = await snapshot()
        except (OSError, ValueError, asyncio.TimeoutError, ClientError):
            pass
        finally:
            response.force_close()
        return response

    async def audio(request):
        # Subscription only: the Pi's shared microphone capture stays untouched.
        try:
            async with session.get(pi_url + '/audio') as upstream:
                if upstream.status != 200:
                    raise web.HTTPServiceUnavailable(text='Pi microphone unavailable')
                response = web.StreamResponse(headers={'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store'})
                await response.prepare(request)
                try:
                    async for chunk in upstream.content.iter_any():
                        await response.write(chunk)
                finally:
                    response.force_close()
                return response
        except (OSError, asyncio.TimeoutError, ClientError):
            raise web.HTTPServiceUnavailable(text='Pi microphone disconnected')

    async def health(request):
        return web.json_response({'pi_stream_url': pi_url})

    async def lifecycle(app):
        nonlocal session
        async with ClientSession(timeout=ClientTimeout(total=None, sock_connect=3, sock_read=5)) as session:
            task = asyncio.create_task(relay_camera(session, pi_url, config_path, camera_url))
            try:
                yield
            finally:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task

    app.cleanup_ctx.append(lifecycle)
    app.add_routes([web.get('/api/stream', sensors), web.get('/api/audio', audio), web.get('/health', health)])
    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--config', required=True)
    parser.add_argument('--port', type=int, default=9081)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    web.run_app(create_app(args.url, args.config), host='127.0.0.1', port=args.port, access_log=None)
