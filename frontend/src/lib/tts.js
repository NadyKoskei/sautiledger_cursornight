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
let playGeneration = 0;
let abortController = null;
const speakingListeners = new Set();

function notifySpeaking(active) {
  speakingListeners.forEach((listener) => listener(Boolean(active)));
}

export function subscribeSpeaking(listener) {
  speakingListeners.add(listener);
  return () => speakingListeners.delete(listener);
}

export function stopSpeech() {
  playGeneration += 1;
  abortController?.abort();
  abortController = null;
  stopCurrent();
  notifySpeaking(false);
}

function speakWithBrowser(text, language) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_VOICE[language] || 'en-KE';
    utterance.rate = 1;
    utterance.onend = () => notifySpeaking(false);
    utterance.onerror = () => notifySpeaking(false);
    notifySpeaking(true);
    window.speechSynthesis.speak(utterance);
  } catch {
    notifySpeaking(false);
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

async function speakWithElevenLabs(text, signal) {
  const token = getToken();
  if (!token) throw new Error('not signed in');

  const response = await fetch(`${API_BASE}/api/tts`, {
    method: 'POST',
    signal,
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
    notifySpeaking(false);
  };
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    if (current === audio) current = null;
    notifySpeaking(false);
  };
  notifySpeaking(true);
  await audio.play();
}

export function playElevenLabsAudio(text, { language = 'en' } = {}) {
  const spoken = String(text || '').trim();
  if (!spoken) return;

  const generation = playGeneration + 1;
  playGeneration = generation;
  abortController?.abort();
  abortController = new AbortController();
  const { signal } = abortController;

  speakWithElevenLabs(spoken, signal).catch((error) => {
    if (error?.name === 'AbortError' || generation !== playGeneration) return;
    speakWithBrowser(spoken, language);
  });
}
