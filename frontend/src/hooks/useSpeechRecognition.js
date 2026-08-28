import { useCallback, useEffect, useRef, useState } from 'react';

const LANG_CODES = {
  en: 'en-KE',
  sw: 'sw-KE',
  mixed: 'en-KE',
};

export function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Thin wrapper over the Web Speech API.
 * Interim results are surfaced so the shopkeeper can see they are being heard.
 */
export function useSpeechRecognition({ language = 'en', onResult } = {}) {
  const recognitionRef = useRef(null);
  const resultRef = useRef(onResult);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  const supported = Boolean(getSpeechRecognition());

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError('This browser cannot listen. Use Chrome, or type the sale instead.');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = LANG_CODES[language] || 'en-KE';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setListening(true);
      setInterim('');
      setError('');
    };

    recognition.onerror = (event) => {
      setError(
        event.error === 'not-allowed'
          ? 'Microphone blocked. Allow mic access in your browser settings.'
          : 'I could not hear that. Try again in a quieter spot.'
      );
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onresult = (event) => {
      let finalText = '';
      let pending = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else pending += result[0].transcript;
      }

      setInterim(pending || finalText);
      if (finalText.trim()) resultRef.current?.(finalText.trim());
    };

    recognition.start();
  }, [language]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { listening, interim, error, supported, start, stop, setError };
}
