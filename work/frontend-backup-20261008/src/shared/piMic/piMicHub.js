const http = require('http');
const WebSocket = require('ws');
const WS_PATH = '/ws/pi-mic';

// Each participant owns one connection and one set of listeners.
function createPiMicHub({ url, userId, mode = 'ondemand' }) {
  const clients = new Set();
  let request, retry, stall, carry, connected = false, stopped = false;
  const status = () => ({ type: 'status', user_id: userId, configured: Boolean(url), connected, mode });
  const wanted = () => !stopped && url && (mode === 'always' || clients.size > 0);
  const announce = () => clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(status()));
  });
  function drop() {
    clearTimeout(stall); clearTimeout(retry); retry = null;
    const old = request; request = null; old?.destroy();
    carry = null; connected = false; announce();
  }
  function connect() {
    if (request || !wanted()) return;
    const req = http.get(`${url.replace(/\/+$/, '')}/api/audio`);
    request = req;
    const arm = () => { clearTimeout(stall); stall = setTimeout(() => req.destroy(new Error('audio stalled')), 3000); };
    const fail = () => {
      if (request !== req) return;
      drop();
      if (wanted()) retry = setTimeout(() => { retry = null; connect(); }, 2000);
    };
    arm();
    req.on('error', fail);
    req.on('response', res => {
      if (res.statusCode !== 200) { res.resume(); fail(); return; }
      res.on('data', chunk => {
        if (request !== req) return;
        arm();
        if (!connected) { connected = true; announce(); }
        let data = carry ? Buffer.concat([carry, chunk]) : chunk;
        carry = data.length % 2 ? data.subarray(-1) : null;
        if (carry) data = data.subarray(0, -1);
        if (!data.length) return;
        for (const ws of clients) {
          if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 65536) ws.send(data, { binary: true });
        }
      });
      res.on('end', fail); res.on('error', fail); res.on('close', fail);
    });
  }
  return {
    status,
    start: connect,
    stop() { stopped = true; drop(); clients.forEach(ws => ws.close()); },
    attach(ws) {
      clients.add(ws); ws.send(JSON.stringify(status())); connect();
      const leave = () => { clients.delete(ws); if (!wanted()) drop(); };
      ws.on('close', leave); ws.on('error', leave);
    },
  };
}
module.exports = { WS_PATH, createPiMicHub };
