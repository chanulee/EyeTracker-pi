"""Separate localhost example frontend; replace its static page or use another server."""
from pathlib import Path
from urllib.parse import urlsplit

from aiohttp import web

from .common import load_config

HERE = Path(__file__).parent


def create_app(config_dir=HERE):
    @web.middleware
    async def local_only(request, handler):
        if request.remote not in ('127.0.0.1', '::1') or urlsplit('http://' + request.host).hostname not in ('localhost', '127.0.0.1', '::1'):
            raise web.HTTPForbidden()
        response = await handler(request)
        if not response.prepared:
            response.headers['Cache-Control'] = 'no-store'
        return response

    app = web.Application(middlewares=[local_only])

    async def page(request):
        return web.FileResponse(HERE / 'frontend-example' / 'index.html')

    async def client(request):
        return web.FileResponse(HERE / 'web' / 'gaze-client.js')

    async def connections(request):
        players = []
        for user, port, filename in ((1, 8080, 'mac-config.json'), (2, 8081, 'mac-user2-config.json')):
            # Only this example server reads local settings. An external frontend receives
            # the gaze token from the operator, never the Pi video-upload token.
            path = Path(config_dir) / filename
            config = load_config(path, {}) if path.exists() else {}
            players.append({'user_id': user, 'url': f'ws://localhost:{port}/gaze', 'token': config.get('gaze_token', '')})
        return web.json_response({'players': players})

    app.add_routes([web.get('/', page), web.get('/gaze-client.js', client), web.get('/connection.json', connections)])
    app.router.add_static('/assets/', HERE / 'frontend-example')
    return app


if __name__ == '__main__':
    web.run_app(create_app(), host='127.0.0.1', port=5173, print=None, access_log=None)
