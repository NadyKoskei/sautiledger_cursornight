/**
 * The "mouth" half of the system.
 *
 * ElevenLabs will slot in here later; until an API key exists we speak with the
 * browser's own voice so the confirmation is still audible during a demo.
 */

const LANG_VOICE = {
  en: 'en-KE',
  sw: 'sw-KE',
  mixed: 'en-KE',
};

export function playElevenLabsAudio(text, { language = 'en' } = {}) {
  console.log('[ElevenLabs placeholder]', text);

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
