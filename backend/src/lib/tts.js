const PLACEHOLDER_KEYS = new Set(['', 'your_elevenlabs_api_key_here']);

export function isTtsConfigured() {
  const key = process.env.ELEVENLABS_API_KEY || '';
  const voiceId = process.env.ELEVENLABS_VOICE_ID || '';
  return key.startsWith('sk_') && Boolean(voiceId.trim());
}

export async function synthesizeSpeech(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY || '';
  const voiceId = String(process.env.ELEVENLABS_VOICE_ID || '').trim();
  const spoken = String(text || '').trim();

  if (!apiKey || PLACEHOLDER_KEYS.has(apiKey) || !apiKey.startsWith('sk_')) {
    const error = new Error('Voice is not set up on the server yet. Add an ElevenLabs API key.');
    error.status = 503;
    throw error;
  }

  if (!voiceId) {
    const error = new Error('Add ELEVENLABS_VOICE_ID to the server so I can speak.');
    error.status = 503;
    throw error;
  }

  if (!spoken) {
    const error = new Error('Nothing to say.');
    error.status = 400;
    throw error;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: spoken.slice(0, 2500),
        model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      }),
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const code = payload.code || payload.status || payload.detail?.status;
    console.error('ElevenLabs TTS error', response.status, code || payload);
    const error = new Error(
      response.status === 404
        ? 'That ElevenLabs voice ID was not found. Check ELEVENLABS_VOICE_ID.'
        : 'I could not speak that just now.'
    );
    error.status = response.status === 401 || response.status === 404 ? 503 : 502;
    throw error;
  }

  return Buffer.from(await response.arrayBuffer());
}
