"""Startup presentation and the swappable localhost frontend contract."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from aiohttp.test_utils import TestClient, TestServer

from exhibition import startup
from exhibition.frontend import create_app


class StartupCheck(unittest.TestCase):
    def test_frontend_urls(self):
        for value in ('http://localhost:5173', 'https://art.example/show', ''):
            self.assertEqual(startup.validate_frontend(value), value)
        for value in ('javascript:alert(1)', 'file:///tmp/art', 'http://user:password@localhost:5173', 'http://localhost\n'):
            with self.assertRaises(ValueError):
                startup.validate_frontend(value)

    def test_three_stage_banner_and_admin_open(self):
        replies = [
            io.BytesIO(json.dumps({'user_id': 1, 'camera_connected': False, 'simulate': False}).encode()),
            io.BytesIO(json.dumps({'user_id': 2, 'camera_connected': True, 'simulate': False}).encode()),
            io.BytesIO(b'{"players":[{},{}]}'),
        ]
        output = io.StringIO()
        with patch.object(startup, 'urlopen', side_effect=replies), \
             patch.object(startup, 'server_settings', return_value={'frontend_url': 'http://localhost:5173', 'example_frontend': True}), \
             patch.object(startup, 'lan_address', return_value='192.168.1.20'), \
             patch.dict('os.environ', {'EYE_OPEN_ADMIN': '1'}), \
             patch.object(startup.webbrowser, 'open', return_value=True) as open_browser, \
             contextlib.redirect_stdout(output):
            startup.announce()
        message = output.getvalue()
        self.assertIn('Pi SW → Mac mini compute server → 별도 작품 프론트엔드', message)
        self.assertIn('1P Pi: 연결 대기 · ws://192.168.1.20:8080/camera', message)
        self.assertIn('2P Pi: 연결됨 · ws://192.168.1.20:8081/camera', message)
        self.assertIn('http://localhost:5173', message)
        self.assertNotIn('gl_sphere', message)
        open_browser.assert_called_once_with(startup.ADMIN)


class ExampleFrontendCheck(unittest.IsolatedAsyncioTestCase):
    async def test_only_gaze_credentials_and_local_page(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for filename in ('mac-config.json', 'mac-user2-config.json'):
                (root / filename).write_text(json.dumps({'token': 'private-pi-upload-token', 'gaze_token': 'art-subscription-token'}))
            client = TestClient(TestServer(create_app(root)))
            await client.start_server()
            try:
                response = await client.get('/connection.json')
                content = await response.text()
                self.assertNotIn('private-pi-upload-token', content)
                players = json.loads(content)['players']
                self.assertEqual([p['user_id'] for p in players], [1, 2])
                self.assertEqual(players[0]['token'], 'art-subscription-token')
                self.assertEqual((await client.get('/')).status, 200)
                self.assertEqual((await client.get('/connection.json', headers={'Host': 'evil.example'})).status, 403)
                self.assertEqual((await client.get('/assets/../mac-config.json')).status, 404)
            finally:
                await client.close()
