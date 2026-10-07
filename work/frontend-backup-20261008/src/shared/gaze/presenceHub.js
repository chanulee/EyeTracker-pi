const WebSocket = require('ws');

// /presence_test(센서)가 보낸 인원 인식 결과를 /pre_opening(디스플레이)에 중계한다.
const WS_PATH = '/ws/presence';
// 디스플레이가 잠깐 끊겼다 붙어도 방금 지나간 통과 신호를 놓치지 않게 이 시간 안의 통과는 다시 알려 준다.
const PASS_FRESH_MS = 3000;

/** @type {Set<import('ws').WebSocket>} */
const displays = new Set();
/** @type {Set<import('ws').WebSocket>} */
const sensors = new Set();
let lastState = null;
let lastPassAt = 0;

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(targets, payload) {
  targets.forEach((ws) => send(ws, payload));
}

function peers() {
  return { type: 'peers', sensors: sensors.size, displays: displays.size };
}

function broadcastPeers() {
  const payload = peers();
  broadcast(displays, payload);
  broadcast(sensors, payload);
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {{ role: 'display' | 'sensor' }} meta
 */
function attachPresenceClient(ws, meta) {
  const role = meta.role;
  if (role !== 'display' && role !== 'sensor') {
    send(ws, { type: 'error', message: 'invalid role' });
    ws.close();
    return;
  }

  const group = role === 'display' ? displays : sensors;
  group.add(ws);
  ws.on('close', () => {
    group.delete(ws);
    broadcastPeers();
  });

  const fresh = Date.now() - lastPassAt < PASS_FRESH_MS;
  send(ws, { ...peers(), type: 'joined', role, state: lastState, passAt: fresh ? lastPassAt : 0 });
  broadcastPeers();

  if (role !== 'sensor') return;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === 'state') {
      lastState = { kept: msg.kept, faces: msg.faces, progress: msg.progress, at: Date.now() };
      broadcast(displays, { type: 'state', ...lastState });
    }
    if (msg.type === 'pass') {
      lastPassAt = Date.now();
      broadcast(displays, { type: 'pass', at: lastPassAt });
    }
  });
}

module.exports = { WS_PATH, attachPresenceClient };
