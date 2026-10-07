import QRCode from 'qrcode';

/*
 * 기본은 흰 바탕에 청회색 QR(/5 도감 카드). ?tone=light 면 흰 QR 에 바탕이 투명해서,
 * 배경 영상·유리 패널 위에 바탕 사각형 없이 얹을 수 있다(/3·/fail 에서 쓴다).
 */
const TONES = {
  dark: { dark: '#6887ab', light: '#ffffff' },
  light: { dark: '#ffffff', light: '#00000000' },
};

/** QR PNG (브라우저 qrcode 번들 이슈 회피) */
export default async function handler(req, res) {
  const raw = req.query.url;
  const url = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  if (!url || url.length > 2048) {
    res.status(400).json({ error: 'missing url' });
    return;
  }

  try {
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: TONES[req.query.tone === 'light' ? 'light' : 'dark'],
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'qr failed' });
  }
}
