const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const { attachMobileLinkClient } = require('./src/shared/mobileLink/mobileSessionHub.js');
const { attachPresenceClient, WS_PATH: PRESENCE_WS_PATH } = require('./src/shared/gaze/presenceHub.js');
const { createPiMicHub, WS_PATH: PI_MIC_WS_PATH } = require('./src/shared/piMic/piMicHub.js');
const { createSensorHub, localHardwareRequest } = require('./src/shared/piSensors/sensorHub.cjs');
const { createComputeProxy } = require('./src/shared/computeGaze/proxy.cjs');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const handleUpgrade = app.getUpgradeHandler();

app.prepare().then(() => {
  // NEXT_PUBLIC_GAZE_SOURCE=pi 일 때만 Pi 눈 카메라 시선(/gaze, /api/players/*)을 맥 처리 서버로 중계한다.
  // .env 는 Next 가 준비되면서 읽히므로 여기서 확인한다.
  const computeProxy = process.env.NEXT_PUBLIC_GAZE_SOURCE === 'pi' ? createComputeProxy(require('ws')) : null;
  if (computeProxy) console.log(`[pi-gaze] 맥 처리 서버 브리지로 중계: 127.0.0.1:${process.env.EYE_BRIDGE_PORT || 5174}`);

  const hardware = [1].map(userId => {
    const url = process.env[`PI_SENSOR_URL_${userId}`] || '';
    if (url && (!/^http:\/\//.test(url) || new URL(url).username || new URL(url).password))
      throw new Error(`PI_SENSOR_URL_${userId}: http://Pi주소:8080 형식으로 설정하세요`);
    return { sensors: createSensorHub({ url, userId }), mic: createPiMicHub({ url, userId,
      mode: process.env.PI_MIC_MODE === 'always' ? 'always' : 'ondemand' }) };
  });
  const server = createServer((req, res) => {
    if (parse(req.url).pathname === '/api/hardware') {
      if (!localHardwareRequest(req)) { res.writeHead(403); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ players: hardware.map(h => ({ sensors: h.sensors.status(), mic: h.mic.status() })) }));
      return;
    }
    if (computeProxy && computeProxy.http(req, res)) return;
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (computeProxy && computeProxy.upgrade(req, socket, head)) return;
    const { pathname } = parse(req.url || '', true);
    if (pathname === '/ws/mobile') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return;
    }
    if (pathname === PRESENCE_WS_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.once('message', (raw) => {
          let msg;
          try {
            msg = JSON.parse(String(raw));
          } catch {
            ws.close();
            return;
          }
          if (msg.type !== 'join') {
            ws.close();
            return;
          }
          attachPresenceClient(ws, { role: msg.role });
        });
      });
      return;
    }
    if (pathname === PI_MIC_WS_PATH || pathname === '/ws/sensors') {
      const userId = new URL(req.url, 'http://localhost').searchParams.get('user_id') || '1';
      if (userId !== '1' || !localHardwareRequest(req)) {
        socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return;
      }
      wss.handleUpgrade(req, socket, head, ws => {
        hardware[Number(userId) - 1][pathname === PI_MIC_WS_PATH ? 'mic' : 'sensors'].attach(ws);
      });
      return;
    }
    handleUpgrade(req, socket, head).catch((err) => {
      console.error('Failed to handle upgrade', err);
      socket.destroy();
    });
  });

  wss.on('connection', (ws) => {
    let joined = false;

    ws.on('message', (raw) => {
      if (joined) return;
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'invalid json' }));
        ws.close();
        return;
      }
      if (msg.type !== 'join' || !msg.sessionId || !msg.role) {
        ws.send(JSON.stringify({ type: 'error', message: 'expected join' }));
        ws.close();
        return;
      }
      joined = true;
      attachMobileLinkClient(ws, {
        sessionId: msg.sessionId,
        role: msg.role,
        district: msg.district ?? null,
        slot: msg.slot === 'A' || msg.slot === 'B' ? msg.slot : null,
      });
    });

    ws.on('error', () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  });

  server.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(`> Ready on http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port} (WebSocket ${'/ws/mobile'})`);
    hardware.forEach(h => { h.sensors.start(); h.mic.start(); });
  });
});
process.on('unhandledRejection', err => { console.error(err); process.exit(1); });
