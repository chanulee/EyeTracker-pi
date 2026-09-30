import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { pointFromPacket } from '../frontend-integration/coordinates.mjs';
const require = createRequire(new URL('../frontend-example/package.json', import.meta.url));
const WS = require('ws');
const { createComputeProxy } = require('../frontend-integration/proxy.cjs');
const size = { width: 1200, height: 800 };
const packet = { valid: true, x: .75, y: .25, frame_age_ms: 10, calibration_viewport: size };
assert.deepEqual(pointFromPacket(packet, size), { x: 900, y: 200 });
assert.equal(pointFromPacket({ ...packet, valid: false }, size), null);
assert.equal(pointFromPacket({ ...packet, frame_age_ms: 351 }, size), null);
assert.equal(pointFromPacket({ ...packet, frame_age_ms: null }, size), null);
assert.equal(pointFromPacket({ ...packet, x: NaN }, size), null);
assert.equal(pointFromPacket(packet, { width: 1000, height: 800 }), null);
const bridge = http.createServer((req, res) => {
  assert.equal(req.headers.origin, `http://127.0.0.1:${bridge.address().port}`);
  assert.equal(req.headers.authorization, undefined);
  if (req.method === 'POST') {
    req.on('data', () => {});
    req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end('{"saved":true}'); });
  } else { res.setHeader('content-type', 'application/json'); res.end('{"camera_connected":true}'); }
});
const upstream = new WS.WebSocketServer({ server: bridge });
upstream.on('connection', (ws, req) => { ws.send(JSON.stringify({ type: 'gaze', user_id: Number(new URL(req.url, 'http://localhost').searchParams.get('user_id')) })); });
bridge.listen(0, '127.0.0.1'); await once(bridge, 'listening');
process.env.EYE_BRIDGE_PORT = String(bridge.address().port);
const proxy = createComputeProxy(WS);
const server = http.createServer((req, res) => { if (!proxy.http(req, res)) { res.writeHead(404); res.end(); } });
server.on('upgrade', (req, socket, head) => { if (!proxy.upgrade(req, socket, head)) socket.destroy(); });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  assert.equal((await fetch(base + '/api/players/1/status')).status, 200);
  assert.equal((await fetch(base + '/api/players/1/calibration', { method: 'POST', body: '{}', headers: { Origin: base, Authorization: 'not-forwarded' } })).status, 200);
  assert.equal((await fetch(base + '/api/players/1/calibration', { method: 'POST', body: '{}', headers: { Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await fetch(base + '/api/players/1/config')).status, 404);
  for (const user of [1, 2]) {
    const ws = new WS(base.replace('http:', 'ws:') + `/gaze?user_id=${user}`, { origin: base });
    const [raw] = await once(ws, 'message');
    assert.equal(JSON.parse(raw).user_id, user);
    const closed = once(ws, 'close'); ws.close(); await closed;
  }
  console.log('same-origin HTTP/WS bridge, player routing, origin guard and viewport coordinates: OK');
} finally {
  for (const ws of upstream.clients) ws.terminate();
  await new Promise(resolve => upstream.close(resolve));
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => bridge.close(resolve));
}
