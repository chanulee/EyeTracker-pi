const http = require('http');
const WebSocket = require('ws');

function createSensorHub({ url, userId }) {
  const clients = new Set();
  let request, retry, stall, stopped = false;
  let latest = { type: 'sensors', user_id: userId, connected: false };
  const publish = packet => {
    latest = packet;
    for (const ws of clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (ws.bufferedAmount > 65536) { ws.close(1013); continue; }
      ws.send(JSON.stringify(packet));
    }
  };
  function drop() {
    clearTimeout(stall); clearTimeout(retry); retry = null;
    const old = request; request = null; old?.destroy();
    publish({ type: 'sensors', user_id: userId, connected: false });
  }
  function connect() {
    if (stopped || request || !url) return;
    let buffer = '';
    const req = http.get(`${url.replace(/\/+$/, '')}/api/stream`);
    request = req;
    const arm = () => { clearTimeout(stall); stall = setTimeout(() => req.destroy(new Error('sensors stalled')), 1500); };
    const fail = () => {
      if (request !== req) return;
      drop();
      if (!stopped) retry = setTimeout(() => { retry = null; connect(); }, 2000);
    };
    arm(); req.on('error', fail);
    req.on('response', res => {
      if (res.statusCode !== 200) { res.resume(); fail(); return; }
      res.setEncoding('utf8');
      res.on('data', chunk => {
        if (request !== req) return;
        buffer += chunk;
        if (buffer.length > 65536) { req.destroy(new Error('oversized sensor event')); return; }
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (block.split('\n').some(line => line.startsWith('event:'))) continue;
          const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          try {
            const p = JSON.parse(data);
            if (!p.imu || !p.mic || !Array.isArray(p.imu.q) || p.imu.q.length !== 4 || !p.imu.q.every(Number.isFinite)) continue;
            arm();
            publish({ type: 'sensors', user_id: userId, connected: true, mock: Boolean(p.mock), imu: p.imu, mic: p.mic });
          } catch { /* Comments, retry directives, or malformed packets are ignored. */ }
        }
      });
      res.on('end', fail); res.on('error', fail); res.on('close', fail);
    });
  }
  return {
    start: connect,
    status: () => latest,
    attach(ws) { clients.add(ws); ws.send(JSON.stringify(latest)); ws.on('close', () => clients.delete(ws)); ws.on('error', () => clients.delete(ws)); },
    stop() { stopped = true; drop(); clients.forEach(ws => ws.close()); },
  };
}

// Hardware streams are only for the local exhibition browser; mobile routes stay on LAN.
function localHardwareRequest(req) {
  try {
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
      && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${req.headers.host}`).hostname)
      && (!req.headers.origin || req.headers.origin === `http://${req.headers.host}`);
  } catch { return false; }
}
module.exports = { createSensorHub, localHardwareRequest };
