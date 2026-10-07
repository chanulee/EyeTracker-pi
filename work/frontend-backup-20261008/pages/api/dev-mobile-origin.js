import os from 'os';

function pickLanIPv4() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        candidates.push({ name, address: net.address });
      }
    }
  }
  const wifi = candidates.find((c) => /wi-?fi|wlan|wireless/i.test(c.name));
  if (wifi) return wifi.address;
  return candidates[0]?.address ?? null;
}

function isPrivateIpv4(host) {
  return (
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** 현재 서버·접속 포트 기준, 폰 QR용 origin (LAN IP) */
export default function handler(req, res) {
  const hostHeader = req.headers.host || 'localhost:3000';
  const port = hostHeader.includes(':') ? hostHeader.split(':').pop() : '3000';
  const hostname = hostHeader.includes(':') ? hostHeader.slice(0, hostHeader.lastIndexOf(':')) : hostHeader;

  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  let ip = hostname;

  if (isLocalhost || !isPrivateIpv4(hostname)) {
    const lan = pickLanIPv4();
    if (lan) ip = lan;
  }

  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const origin = `${proto}://${ip}:${port}`;
  const lanIp = pickLanIPv4();

  res.status(200).json({
    origin,
    ip,
    port,
    host: hostHeader,
    lanIp,
  });
}
