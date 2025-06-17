import fetch from 'node-fetch';

const ELEVEN_KEY = process.env.ELEVEN_KEY;
const VOICE_ID = process.env.ELEVEN_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

export async function synth(text) {
  if (!ELEVEN_KEY) throw new Error('Missing ELEVEN_KEY');

  const safeText = text.length > 2400 ? text.slice(0, 2400) : text;

  async function requestOnce(){
    return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVEN_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: safeText, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
  }

  let res = await requestOnce();
  if (res.status === 500) {
    // transient server error – wait and retry once
    await new Promise(r => setTimeout(r, 1200));
    res = await requestOnce();
  }

  if (!res.ok) {
    const err = await res.text();
    console.error('ElevenLabs error', res.status, err);
    throw new Error('TTS request failed');
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer;
} 