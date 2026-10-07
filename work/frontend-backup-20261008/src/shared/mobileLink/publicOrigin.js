/**
 * QR·/mobile 링크 origin — 지금은 서버 LAN IP 기준 (/api/dev-mobile-origin).
 * 배포 시 NEXT_PUBLIC_MOBILE_APP_URL 로 덮어쓸 수 있음.
 */
const ORIGIN_API = '/api/dev-mobile-origin';

function isPrivateIpv4Host(hostname) {
  return (
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

export function getMobilePublicOriginSync() {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, port } = window.location;
  if (isPrivateIpv4Host(hostname)) {
    const portSuffix = port ? `:${port}` : '';
    return `${protocol}//${hostname}${portSuffix}`;
  }
  return window.location.origin;
}

/** 접속 IP·포트에 맞춘 폰용 origin (항상 API 우선) */
export async function resolveMobilePublicOrigin() {
  if (typeof window === 'undefined') return '';

  const deployUrl = process.env.NEXT_PUBLIC_MOBILE_APP_URL;
  if (deployUrl) {
    return String(deployUrl).replace(/\/$/, '');
  }

  try {
    const res = await fetch(ORIGIN_API, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.origin) {
        return String(data.origin).replace(/\/$/, '');
      }
    }
  } catch {
    /* fallback */
  }

  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : '';
  return `${protocol}//${hostname}${portSuffix}`;
}

export function buildMobileJoinUrl(sessionId, originBase, districtName, slot) {
  if (!sessionId) return '';
  const base = (originBase || getMobilePublicOriginSync()).replace(/\/$/, '');
  let join = `${base}/mobile?join=${encodeURIComponent(sessionId)}`;
  const name = typeof districtName === 'string' ? districtName.trim() : '';
  if (name) join += `&district=${encodeURIComponent(name)}`;
  if (slot === 'A' || slot === 'B') join += `&slot=${slot}`;
  return join;
}

export function isLikelyLocalhostQr(originBase) {
  if (typeof window === 'undefined') return false;
  const base = originBase || getMobilePublicOriginSync();
  try {
    const { hostname } = new URL(base);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(base);
  }
}
