// Compute-owned integration: fixed localhost destination, no settings/upload-token proxy.
const http = require('http');
const ROUTES = /^\/(?:connection\.json|gaze-client\.js|api\/players\/[12]\/(?:status|preview|plan|calibration|demo))$/;
function createComputeProxy(WebSocket) {
  const port = Number(process.env.EYE_BRIDGE_PORT || 5174);
  const wss = new WebSocket.WebSocketServer({ noServer: true });
  const local = (req) => {
    try {
      return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
        && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${req.headers.host}`).hostname);
    } catch { return false; }
  };
  const sameOrigin = (req) => !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
  return {
    http(req, res) {
      const url = new URL(req.url, 'http://localhost');
      if (!ROUTES.test(url.pathname)) return false;
      if (!local(req) || (req.method !== 'GET' && (!sameOrigin(req) || !req.headers.origin))) {
        res.writeHead(403); res.end('Open the exhibition on this Mac.'); return true;
      }
      const headers = { ...req.headers, host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` };
      delete headers.cookie; delete headers.authorization;
      const upstream = http.request({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers }, (reply) => {
        res.writeHead(reply.statusCode, { 'Content-Type': reply.headers['content-type'] || 'application/json', 'Cache-Control': 'no-store' });
        reply.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(503); res.end('Compute bridge unavailable'); });
      upstream.setTimeout(15000, () => upstream.destroy());
      req.pipe(upstream);
      res.on('close', () => upstream.destroy());
      return true;
    },
    upgrade(req, socket, head) {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/gaze') return false;
      if (!local(req) || !sameOrigin(req) || !['1', '2'].includes(url.searchParams.get('user_id') || '1')) {
        socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return true;
      }
      wss.handleUpgrade(req, socket, head, (client) => {
        const upstream = new WebSocket(`ws://127.0.0.1:${port}/gaze?user_id=${url.searchParams.get('user_id') || '1'}`, { origin: `http://127.0.0.1:${port}` });
        upstream.on('message', (data) => {
          if (client.readyState === WebSocket.OPEN) {
            if (client.bufferedAmount > 65536) { client.close(1013); return; }
            client.send(String(data));
          }
        });
        upstream.on('error', () => client.close(1011));
        upstream.on('close', () => client.close());
        client.on('close', () => upstream.close());
        client.on('error', () => upstream.close());
      });
      return true;
    },
  };
}
module.exports = { createComputeProxy };
