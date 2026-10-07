import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { collectNeutral, freshImu, observeTurns, relativeLook } from '../frontend/src/shared/piSensors/orientation.mjs';
import { pointFromPacket } from '../frontend/src/shared/computeGaze/coordinates.mjs';
import { guideAction, guidePlant, GUIDE_INPUT_BEATS } from '../frontend/src/f2/guideScenario.mjs';
import { participantHasSent, participantConnected } from '../frontend/src/shared/mobileLink/slotPlants.js';
import { trackedPlayers } from '../frontend/src/shared/piSensors/presence.mjs';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const WS = require('ws');
const { createPiMicHub } = require('../frontend/src/shared/piMic/piMicHub');
const { createSensorHub, localHardwareRequest } = require('../frontend/src/shared/piSensors/sensorHub.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async check => { for (let i = 0; i < 100; i++) { if (check()) return; await sleep(50); } throw new Error('Timed out'); };
const neutral = [0, 0, 0, 1], q = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
assert.ok(Math.abs(relativeLook(q, neutral).yaw - Math.PI/4) < 1e-8);
assert.deepEqual(relativeLook(q, q), { yaw: 0, pitch: 0 });
assert.ok(relativeLook(q, neutral, -1).yaw < 0);
assert.equal(relativeLook([0, 0, 0, 0], neutral), null);
assert.deepEqual(trackedPlayers({ A: { face: true, stale: false, received: 990 }, B: { face: true, stale: false, received: 0 } }, 1000), ['A']);
assert.deepEqual(trackedPlayers({ A: { face: false, stale: false, received: 990 }, B: { face: true, stale: true, received: 990 } }, 1000), []);
assert.equal(freshImu({ connected: true, receivedAt: 0, imu: { status: 'ok', age: 0 } }, 751), false);
assert.equal(pointFromPacket({ valid: true, x: .5, y: .5, frame_age_ms: 351 }, { width: 1200, height: 800 }), null);
assert.equal(localHardwareRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:3000', origin: 'http://evil.invalid' } }), false);

// Neutral needs three seconds of distinct steady samples, handles q/-q, and resets on motion/dropout.
const packetAt = (time, value = q) => ({ connected: true, receivedAt: time, imu: { status: 'ok', age: 0, q: value } });
const steady = {};
for (let t = 0; t < 3000; t += 100) assert.equal(collectNeutral(steady, packetAt(t, t % 200 ? q.map(v => -v) : q), t), null);
const forward = collectNeutral(steady, packetAt(3000), 3000);
assert.ok(Math.abs(relativeLook(q, forward).yaw) < 1e-8);
assert.ok(Math.abs(relativeLook(neutral, forward).yaw + Math.PI / 4) < 1e-8);
const moving = {};
collectNeutral(moving, packetAt(0), 0);
assert.equal(collectNeutral(moving, packetAt(100, neutral), 100), null);
assert.equal(moving.window.start, 100);
assert.equal(collectNeutral(moving, packetAt(100, neutral), 3100), null);
assert.equal(moving.window, null); // A repeated old packet cannot finish the timer.
const gap = {};
collectNeutral(gap, packetAt(0), 0);
collectNeutral(gap, packetAt(800), 800);
assert.equal(gap.window.start, 800);

// Waiting, one-sided turns, stale data, and one-frame spikes never unlock the scene.
const turns = {};
const turnPacket = (t, angle) => packetAt(t, [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]);
for (let t = 0; t < 10000; t += 100) assert.equal(observeTurns(turns, turnPacket(t, 0), neutral, t), false);
assert.equal(observeTurns(turns, turnPacket(10000, -.4), neutral, 10000), false);
assert.equal(observeTurns(turns, turnPacket(10100, 0), neutral, 10100), false);
assert.equal(turns.left, undefined);
for (let t = 10200; t <= 10500; t += 100) assert.equal(observeTurns(turns, turnPacket(t, -.4), neutral, t), false);
assert.equal(turns.left, true);
assert.equal(turns.right, undefined);
assert.equal(observeTurns(turns, turnPacket(10600, .4), neutral, 10600), false);
assert.equal(observeTurns(turns, turnPacket(10600, .4), neutral, 12000), false);
assert.equal(observeTurns(turns, turnPacket(12000, .4), neutral, 12000), false);
assert.equal(observeTurns(turns, turnPacket(12200, .4), neutral, 12200), true);
assert.equal(turns.right, true);
assert.ok(relativeLook(q, neutral, -1).yaw === -relativeLook(q, neutral, 1).yaw);

// Every guide input state has fixed content and a bounded automatic successor.
for (const beat of GUIDE_INPUT_BEATS) {
  const action = guideAction(beat);
  assert.ok(action?.text.length > 0, beat);
  assert.ok(['plant', 'answer', 'question'].includes(action.kind), beat);
  if (action.kind === 'plant') assert.ok(action.nx > 0 && action.nx < 1 && action.ny > 0 && action.ny < 1);
  if (action.kind === 'question') assert.ok(GUIDE_INPUT_BEATS.includes(action.next));
}
assert.equal(guideAction('intro'), null);
assert.notEqual(guideAction('f1Reply', 'building').text, guideAction('f1Reply', 'window').text);
assert.equal(guidePlant('마포구').plantVariant, 'mapo-c');
assert.equal(guidePlant('강남구').scripted, true);
assert.equal(participantConnected({ A: true, B: false }), true);
assert.equal(participantHasSent({ A: { sent: true, drawingUrl: '/drawing.png' }, B: {} }), true);
assert.equal(participantHasSent({ A: {}, B: guidePlant() }), false);

const peers = [], hubs = [], browserSockets = [], responses = new Set();
const fakePi = user => http.createServer((req, res) => {
  responses.add(res); res.on('close', () => responses.delete(res));
  if (req.url === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const timer = setInterval(() => {
      // Split SSE across TCP writes, as real HTTP connections are free to do.
      const data = `data: ${JSON.stringify({ mock: true, imu: { status: 'ok', age: 0, q: neutral, accel: [user, 0, 0] }, mic: { status: 'ok', age: 0, rms_db: -user * 10 } })}\n\n`;
      res.write(data.slice(0, 17)); res.write(data.slice(17));
    }, 30);
    res.on('close', () => clearInterval(timer));
  } else if (req.url === '/api/audio') {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    const timer = setInterval(() => { res.write(Buffer.from([user])); res.write(Buffer.from([0, user, 0])); }, 30);
    res.on('close', () => clearInterval(timer));
  } else { res.writeHead(404); res.end(); }
});
let server, wss;
try {
  for (const userId of [1]) {
    const pi = fakePi(userId); pi.listen(0, '127.0.0.1'); await once(pi, 'listening'); peers.push(pi);
    const url = `http://127.0.0.1:${pi.address().port}`;
    hubs.push({ sensor: createSensorHub({ url, userId }), mic: createPiMicHub({ url, userId }) });
    hubs.at(-1).sensor.start();
  }
  server = http.createServer(); wss = new WS.WebSocketServer({ server });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    hubs[Number(url.searchParams.get('user_id')) - 1][url.pathname === '/audio' ? 'mic' : 'sensor'].attach(ws);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  for (const user of [1]) {
    const sensor = new WS(`ws://127.0.0.1:${server.address().port}/sensor?user_id=${user}`);
    const audio = new WS(`ws://127.0.0.1:${server.address().port}/audio?user_id=${user}`);
    browserSockets.push(sensor, audio);
    let packet, pcm;
    sensor.on('message', raw => { packet = JSON.parse(raw); });
    audio.on('message', (data, binary) => { if (binary) pcm = data; });
    await until(() => packet?.connected && pcm?.length);
    assert.equal(packet.user_id, user);
    assert.equal(packet.imu.accel[0], user);
    assert.equal(pcm.length % 2, 0);
    for (let i = 0; i < pcm.length; i += 2) assert.equal(pcm.readInt16LE(i), user);
    const closed = once(audio, 'close'); audio.close(); await closed;
    await until(() => !hubs[user - 1].mic.status().connected);
  }
  // A broken upstream invalidates its data, then reconnects without restarting the browser.
  for (const res of [...responses]) res.destroy();
  await until(() => hubs.every(h => !h.sensor.status().connected));
  await until(() => hubs.every(h => h.sensor.status().connected));
  console.log('PASS: 1P sensor/audio routes and fixed SORA scenario, fragmented SSE/PCM, bounded stream lifecycle, reconnection, origin guard, IMU neutral and stale gaze');
} finally {
  hubs.forEach(h => { h.sensor.stop(); h.mic.stop(); });
  browserSockets.forEach(ws => ws.terminate());
  if (wss) await new Promise(resolve => wss.close(resolve));
  if (server) await new Promise(resolve => server.close(resolve));
  for (const res of responses) res.destroy();
  for (const pi of peers) await new Promise(resolve => pi.close(resolve));
}
