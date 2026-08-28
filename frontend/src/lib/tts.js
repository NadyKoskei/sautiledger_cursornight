/**
 * The "mouth" half of the system.
 *
 * Speaks through the shop's ElevenLabs voice on the backend. Falls back to the
 * browser voice if that request fails, so a sale confirmation is never silent.
 */

import { getToken } from './api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const LANG_VOICE = {
  en: 'en-KE',
  sw: 'sw-KE',
  mixed: 'en-KE',
};

let current = null;

function speakWithBrowser(text, language) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_VOICE[language] || 'en-KE';
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech output is a nicety; never let it break a recorded sale.
  }
}

function stopCurrent() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (current) {
    current.pause();
    current.removeAttribute('src');
    current.load();
    current = null;
  }
}

async function speakWithElevenLabs(text) {
  const token = getToken();
  if (!token) throw new Error('not signed in');

  const response = await fetch(`${API_BASE}/api/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });

  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('audio')) {
    throw new Error('elevenlabs tts unavailable');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  stopCurrent();

  const audio = new Audio(url);
  current = audio;
  audio.onended = () => {
    URL.revokeObjectURL(url);
    if (current === audio) current = null;
  };
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    if (current === audio) current = null;
  };
  await audio.play();
}

export function playElevenLabsAudio(text, { language = 'en' } = {}) {
  const spoken = String(text || '').trim();
  if (!spoken) return;

  speakWithElevenLabs(spoken).catch(() => speakWithBrowser(spoken, language));
}
