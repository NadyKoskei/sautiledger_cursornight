const PLACEHOLDER_KEYS = new Set(['', 'your_elevenlabs_api_key_here']);

export function isSttConfigured() {
  const key = process.env.ELEVENLABS_API_KEY || '';
  return key.startsWith('sk_');
}

function extensionFor(mimeType) {
  const type = String(mimeType || '');
  if (type.includes('mp4')) return 'mp4';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('wav')) return 'wav';
  return 'webm';
}

export async function transcribeSpeech({ audioBase64, mimeType, language, keyterms = [], skipKeyterms = false } = {}) {
  const apiKey = process.env.ELEVENLABS_API_KEY || '';
  if (!apiKey || PLACEHOLDER_KEYS.has(apiKey)) {
    const error = new Error('Voice is not set up on the server yet. Add an ElevenLabs API key.');
    error.status = 503;
    throw error;
  }
  if (!apiKey.startsWith('sk_')) {
    const error = new Error(
      'ElevenLabs needs the secret API key that starts with sk_. The value in .env is a key ID, not the key itself.'
    );
    error.status = 503;
    throw error;
  }

  const buffer = Buffer.from(String(audioBase64 || ''), 'base64');
  if (!buffer.length) {
    const error = new Error('I did not catch any audio. Tap the mic and try again.');
    error.status = 400;
    throw error;
  }

  const type = mimeType || 'audio/webm';
  const form = new FormData();
  form.append('model_id', process.env.ELEVENLABS_STT_MODEL_ID || 'scribe_v2');
  form.append('tag_audio_events', 'false');
  form.append('no_verbatim', 'true');
  form.append('file', new Blob([buffer], { type }), `speech.${extensionFor(type)}`);

  if (language === 'sw') form.append('language_code', 'sw');
  else if (language === 'en') form.append('language_code', 'en');

  const terms = skipKeyterms
    ? []
    : [
        'SautiLedger',
        'sell',
        'restock',
        'credit',
        'madeni',
        ...keyterms,
      ]
        .map((term) => String(term || '').trim())
        .filter((term) => term.length > 1 && term.length < 50)
        .slice(0, 40);

  for (const term of terms) {
    form.append('keyterms', term);
  }

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = payload.code || payload.status || payload.detail?.status;
    console.error('ElevenLabs STT error', response.status, code || payload);
    const invalidKey = code === 'invalid_api_key' || code === 'api_key_id_used_as_api_key' || response.status === 401;
    if (!invalidKey && !skipKeyterms) {
      return transcribeSpeech({ audioBase64, mimeType, language, keyterms: [], skipKeyterms: true });
    }
    const error = new Error(
      invalidKey
        ? 'ElevenLabs needs the secret API key that starts with sk_. The value in .env is a key ID, not the key itself.'
        : 'I could not write down what you said. Try again.'
    );
    error.status = invalidKey ? 503 : 502;
    throw error;
  }

  return String(payload.text || '').trim();
}
