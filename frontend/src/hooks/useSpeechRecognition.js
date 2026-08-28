import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Chrome's Web Speech service does not ship every BCP-47 tag. en-KE and sw-KE
 * often fail immediately with a `network` error, which used to surface as
 * "try again in a quieter spot". Fall back through locales Chrome actually
 * serves, remembering the first one that produces audio.
 */
const LANG_FALLBACKS = {
  en: ['en-KE', 'en-GB', 'en-US'],
  sw: ['sw-KE', 'sw-TZ', 'sw', 'en-GB', 'en-US'],
  mixed: ['en-KE', 'en-GB', 'en-US'],
};

const workingLang = {};

function fallbacksFor(language) {
  return LANG_FALLBACKS[language] || LANG_FALLBACKS.en;
}

function messageForError(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone blocked. Allow mic access in your browser settings.';
    case 'audio-capture':
      return 'No microphone found. Plug one in and try again.';
    case 'network':
      return 'Voice needs an internet connection. Check your network and try again.';
    case 'no-speech':
      return 'I could not hear that. Try again in a quieter spot.';
    case 'language-not-supported':
      return 'This browser cannot listen in that language yet. Try speaking in English.';
    default:
      return 'I could not hear that. Try again.';
  }
}

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
  const lastHeardRef = useRef('');
  const restartTimerRef = useRef(null);
  const sessionRef = useRef({
    cancelled: false,
    gotFinal: false,
    heardAnything: false,
    errored: false,
    langIndex: 0,
    retrying: false,
  });

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  const supported = Boolean(getSpeechRecognition());

  const finishWithTranscript = useCallback((text) => {
    const spoken = String(text || '').trim();
    if (!spoken || sessionRef.current.gotFinal) return;
    sessionRef.current.gotFinal = true;
    resultRef.current?.(spoken);
  }, []);

  const begin = useCallback(
    (langIndex) => {
      const SpeechRecognition = getSpeechRecognition();
      if (!SpeechRecognition) {
        setError('This browser cannot listen. Use Chrome, or type the sale instead.');
        return;
      }

      const langs = fallbacksFor(language);
      const lang = langs[Math.min(langIndex, langs.length - 1)];
      sessionRef.current.langIndex = langIndex;
      sessionRef.current.retrying = false;
      lastHeardRef.current = '';

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
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
        const code = event.error;
        if (code === 'aborted' || code === 'no-speech' || sessionRef.current.cancelled) return;

        const canRetryLang =
          (code === 'language-not-supported' || (code === 'network' && !sessionRef.current.heardAnything)) &&
          langIndex < langs.length - 1;

        if (canRetryLang) {
          sessionRef.current.retrying = true;
          sessionRef.current.langIndex = langIndex + 1;
          return;
        }

        sessionRef.current.errored = true;
        setError(messageForError(code));
      };

      recognition.onresult = (event) => {
        let finalText = '';
        let pending = '';

        for (let i = 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) finalText += text;
          else pending += text;
        }

        const heard = (finalText || pending).trim();
        if (heard) {
          sessionRef.current.heardAnything = true;
          lastHeardRef.current = heard;
          workingLang[language] = lang;
          setInterim(pending || finalText);
        }

        if (finalText.trim()) finishWithTranscript(finalText);
      };

      recognition.onend = () => {
        recognitionRef.current = null;

        if (sessionRef.current.retrying && !sessionRef.current.cancelled) {
          restartTimerRef.current = setTimeout(() => begin(sessionRef.current.langIndex), 160);
          return;
        }

        if (!sessionRef.current.gotFinal && !sessionRef.current.cancelled && !sessionRef.current.errored) {
          if (lastHeardRef.current) finishWithTranscript(lastHeardRef.current);
          else setError(messageForError('no-speech'));
        }

        setListening(false);
      };

      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
        setListening(false);
        setError('I could not start the microphone. Tap again.');
      }
    },
    [finishWithTranscript, language]
  );

  const stop = useCallback(() => {
    if (!lastHeardRef.current) sessionRef.current.cancelled = true;
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (recognitionRef.current) {
      stop();
      return;
    }

    const langs = fallbacksFor(language);
    const remembered = workingLang[language];
    const rememberedIndex = remembered ? langs.indexOf(remembered) : 0;

    sessionRef.current = {
      cancelled: false,
      gotFinal: false,
      heardAnything: false,
      errored: false,
      langIndex: rememberedIndex < 0 ? 0 : rememberedIndex,
      retrying: false,
    };
    lastHeardRef.current = '';
    setError('');
    begin(sessionRef.current.langIndex);
  }, [begin, language, stop]);

  useEffect(
    () => () => {
      sessionRef.current.cancelled = true;
      recognitionRef.current?.abort();
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    },
    []
  );

  return { listening, interim, error, supported, start, stop, setError };
}
