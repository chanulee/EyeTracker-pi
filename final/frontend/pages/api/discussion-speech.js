const VOICE = 'shimmer';
const INSTRUCTIONS = [
  'You are a 21-year-old Korean university student talking with a friend. Lighter and younger than a woman in her thirties.',
  'Use this exact same young voice, pitch, energy, and style on every sentence. Never change them because the words change.',
  'The fixed reference delivery is this sentence: 우리가 바라보는 시선 끝에는 모두 각자의 관심이 담겨 있습니다. 그 시선과 목소리를 따라 내가 원하는 식물을 도시 곳곳에 더해보세요.',
  'Every line must use the exact same perceived pitch, calm tone, vocal age, pace, breath, resonance, and energy as that reference delivery.',
  'Treat questions, invitations, greetings, and statements with identical prosody. Do not lift the pitch for a question or brighten the voice for an invitation.',
  'Keep a steady lower-middle pitch and let every sentence ending settle gently. Do not perform or add emotion based on the meaning of the text.',
  'Youthful and easy, only slightly bright. A little calmer, not bouncy. Casual everyday Korean. Not serious, not stiff, not a performance.',
  'A question, a greeting, and a plain sentence all stay at the same pitch and the same mood.',
  'Lines that start with 안녕하세요 or 여러분이 상상한 stay at the same pitch as the line that starts with 함께 선택해주신. Do not raise them.',
  'Native Seoul pronunciation. Every syllable clear, including batchim. No foreign accent.',
  'Do not crack, slide off, stutter, repeat a sound, or drop a syllable. One even pace. One voice.',
].join(' ');

function steadyLine(text) {
  return text
    .replace(/[!?？！~…]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function pronounceNames(text) {
  return text.replace(/NABI/g, '나비').replace(/SORA/g, '소라');
}

export const config = {
  api: {
    responseLimit: '8mb',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const text = pronounceNames(steadyLine(String(req.body?.text || '')));
  if (!text) return res.status(400).json({ error: 'empty' });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return res.status(503).json({ error: 'no key' });

  try {
    const payload = {
      voice: VOICE,
      input: text.slice(0, 4000),
      instructions: INSTRUCTIONS,
      response_format: 'wav',
      speed: 1,
    };
    let response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...payload, model: 'gpt-4o-mini-tts-2025-03-20' }),
    });
    if (!response.ok) {
      response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...payload, model: 'gpt-4o-mini-tts' }),
      });
    }

    if (!response.ok) {
      return res.status(502).json({ error: 'speech failed' });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audio);
  } catch {
    return res.status(502).json({ error: 'speech failed' });
  }
}
