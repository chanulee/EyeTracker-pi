"""With start-mac.sh --simulate running: .venv/bin/python tests/smoke_live.py."""
import asyncio
import uuid
from aiohttp import ClientSession, ClientTimeout

BASE = 'http://localhost:3000'


async def main():
    async with ClientSession(timeout=ClientTimeout(total=10), headers={'Origin': BASE}) as client:
        async def get(path):
            async with client.get(BASE + path) as response:
                response.raise_for_status()
                return await response.json()

        async def command(user, body):
            async with client.post(f'{BASE}/api/players/{user}/calibration', json=body) as response:
                response.raise_for_status()
                return await response.json()

        statuses = [await get(f'/api/players/{user}/status') for user in (1,)]
        # Never reset or calibrate real participants when running this test.
        assert all(p['simulate'] for p in statuses), 'Start with --simulate; this check refuses real hardware.'
        hardware = await get('/api/hardware')
        assert len(hardware['players']) == 1
        guide = await client.get(BASE + '/api/players/2/status')
        assert guide.status == 404, 'SORA must not require a second worker'
        assert all(p['sensors']['mock'] and p['sensors']['connected'] for p in hardware['players'])
        # One real mobile participant is enough; the guide never claims a device.
        room = 'smoke-' + uuid.uuid4().hex
        async with client.ws_connect(BASE + '/ws/mobile') as kiosk, client.ws_connect(BASE + '/ws/mobile') as phone:
            await kiosk.send_json({'type': 'join', 'sessionId': room, 'role': 'kiosk', 'district': {'name': '종로구'}})
            await phone.send_json({'type': 'join', 'sessionId': room, 'role': 'mobile', 'slot': 'A'})
            await phone.send_json({'type': 'claim', 'clientId': 'smoke-phone', 'slot': 'A'})
            for _ in range(10):
                packet = await kiosk.receive_json(timeout=3)
                if packet.get('type') == 'slots' and packet['slots']['A']:
                    assert not packet['slots']['B']
                    break
            else:
                raise AssertionError('1P phone did not join')
            await phone.send_json({'type': 'state', 'payload': {'type': 'plant_sent', 'slot': 'A', 'plantName': '검사 식물'}})
            packet = await kiosk.receive_json(timeout=3)
            assert packet['slot'] == 'A' and packet['payload']['plantName'] == '검사 식물'
        print('1P mobile join + plant delivery without a SORA device: PASS', flush=True)
        for user in (1,):
            async with client.ws_connect(f'{BASE}/ws/sensors?user_id={user}') as ws:
                p = await ws.receive_json(timeout=3)
                assert p['user_id'] == user and p['connected'] and p['imu']['status'] == 'ok'
            async with client.ws_connect(f'{BASE}/ws/pi-mic?user_id={user}') as ws:
                for _ in range(20):
                    p = await ws.receive(timeout=3)
                    if isinstance(p.data, bytes):
                        assert len(p.data) > 0 and len(p.data) % 2 == 0
                        break
                else:
                    raise AssertionError('No PCM received')
            start = await command(user, {'action': 'begin', 'viewport': {'width': 1200, 'height': 800}})
            session = start['session_id']
            for index in range(9):
                await command(user, {'action': 'sample', 'index': index, 'session_id': session})
            for index in range(3):
                p = await command(user, {'action': 'validate', 'validation_index': index, 'session_id': session})
            assert p['calibrated']
            async with client.ws_connect(f'{BASE}/gaze?user_id={user}') as ws:
                for _ in range(30):
                    p = await ws.receive_json(timeout=3)
                    if p['valid']:
                        assert p['user_id'] == user and 0 <= p['x'] <= 1 and 0 <= p['y'] <= 1
                        break
                else:
                    raise AssertionError('No valid gaze received')
            print(f'{user}P: mock Pi SSE + PCM → production Node proxy; 9+3 calibration → valid gaze: PASS', flush=True)
        for user in (1,):
            await command(user, {'action': 'reset'})


if __name__ == '__main__':
    asyncio.run(main())
