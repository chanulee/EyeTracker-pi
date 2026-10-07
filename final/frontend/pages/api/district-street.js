import { DISTRICT_STREETS } from '../../src/f4/districtStreets';

const ALLOWED = new Set(Object.keys(DISTRICT_STREETS));

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).end();
    return;
  }

  const name = typeof req.query.name === 'string' ? req.query.name : '';
  const imageUrl = DISTRICT_STREETS[name];
  if (!ALLOWED.has(name) || !imageUrl) {
    res.status(404).end();
    return;
  }

  try {
    const upstream = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!upstream.ok) {
      res.status(502).end();
      return;
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'RIFF') {
      res.status(502).end();
      return;
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(bytes);
  } catch {
    res.status(502).end();
  }
}
