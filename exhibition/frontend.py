"""Local compute bridge for the separately maintained exhibition frontend."""
from pathlib import Path
import os
from urllib.parse import urlsplit

from aiohttp import web, ClientSession, ClientTimeout, ClientError, WSMsgType
import asyncio

from .common import load_config

HERE = Path(__file__).parent


def create_app(config_dir=None, worker_ports=(8080, 8081)):
    config_dir = Path(config_dir) if config_dir is not None else Path(os.environ.get('EYE_STATE_DIR', HERE))
    @web.middleware
    async def local_only(request, handler):
        if request.remote not in ('127.0.0.1', '::1') or urlsplit('http://' + request.host).hostname not in ('localhost', '127.0.0.1', '::1'):
            raise web.HTTPForbidden()
        if request.method != 'GET' and request.headers.get('Origin') != f'{request.scheme}://{request.host}':
            raise web.HTTPForbidden(text='같은 작품 화면에서 요청하세요')
        response = await handler(request)
        if not response.prepared:
            response.headers['Cache-Control'] = 'no-store'
        return response

    app = web.Application(middlewares=[local_only], client_max_size=8192)

    async def page(request):
        return web.json_response({'service': 'compute-bridge', 'frontend': 'http://localhost:5173'})

    async def client(request):
        return web.FileResponse(HERE / 'web' / 'gaze-client.js')

    async def connections(request):
        players = []
        for user, port, filename in ((1, worker_ports[0], 'mac-config.json'), (2, worker_ports[1], 'mac-user2-config.json')):
            # Only this example server reads local settings. An external frontend receives
            # the gaze token from the operator, never the Pi video-upload token.
            path = Path(config_dir) / filename
            config = load_config(path, {}) if path.exists() else {}
            players.append({'user_id': user, 'url': f'ws://localhost:{port}/gaze', 'token': config.get('gaze_token', '')})
        return web.json_response({'players': players})

    session_key = web.AppKey('compute-session', ClientSession)
    upstreams = set()

    async def lifecycle(app):
        async with ClientSession(timeout=ClientTimeout(total=5)) as session:
            app[session_key] = session
            try:
                yield
            finally:
                await asyncio.gather(*(ws.close() for ws in list(upstreams)), return_exceptions=True)

    async def compute(request):
        # Fixed local destinations and a narrow API; never proxy config/tokens.
        paths = {'status': '/api/status', 'preview': '/preview.jpg', 'plan': '/api/calibration-plan',
                 'calibration': '/api/calibration', 'demo': '/api/demo'}
        user, resource = request.match_info['user'], request.match_info['resource']
        if user not in ('1', '2') or resource not in paths:
            raise web.HTTPNotFound()
        if (request.method == 'POST') != (resource in ('calibration', 'demo')):
            raise web.HTTPMethodNotAllowed(request.method, ['POST'] if resource in ('calibration', 'demo') else ['GET'])
        target = f'http://127.0.0.1:{worker_ports[int(user) - 1]}'
        query = '?overlay=1' if resource == 'preview' and request.query.get('overlay') == '1' else ''
        try:
            async with app[session_key].request(request.method, target + paths[resource] + query,
                    data=await request.read() if request.method == 'POST' else None,
                    headers={'Origin': target, 'Content-Type': 'application/json'}, allow_redirects=False) as response:
                return web.Response(status=response.status, body=await response.read(), content_type=response.content_type)
        except (ClientError, TimeoutError):
            raise web.HTTPServiceUnavailable(text=f'{user}P compute server 연결을 확인하세요')

    async def gaze(request):
        user = request.query.get('user_id', '1')
        if user not in ('1', '2'):
            raise web.HTTPBadRequest(text='user_id는 1 또는 2입니다')
        port = worker_ports[int(user) - 1]
        target = f'http://127.0.0.1:{port}'
        filename = 'mac-config.json' if user == '1' else 'mac-user2-config.json'
        path = config_dir / filename
        config = load_config(path, {}) if path.exists() else {}
        try:
            upstream = await app[session_key].ws_connect(target + '/gaze',
                params={'token': config.get('gaze_token', '')}, headers={'Origin': target}, heartbeat=10)
        except (ClientError, TimeoutError):
            raise web.HTTPServiceUnavailable(text=f'{user}P compute server 연결을 확인하세요')
        upstreams.add(upstream)
        ws = web.WebSocketResponse(heartbeat=10)
        await ws.prepare(request)

        async def publish():
            try:
                async for msg in upstream:
                    if msg.type == WSMsgType.TEXT:
                        await ws.send_str(msg.data)
            finally:
                await ws.close()

        task = asyncio.create_task(publish())
        try:
            async for _ in ws:
                pass
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            await upstream.close()
            upstreams.discard(upstream)
        return ws

    app.cleanup_ctx.append(lifecycle)
    app.add_routes([web.get('/', page), web.get('/gaze', gaze), web.get('/gaze-client.js', client), web.get('/connection.json', connections),
                    web.get('/api/players/{user}/{resource}', compute), web.post('/api/players/{user}/{resource}', compute)])
    return app


if __name__ == '__main__':
    web.run_app(create_app(), host='127.0.0.1', port=int(os.environ.get('EYE_BRIDGE_PORT', '5174')), print=None, access_log=None)
