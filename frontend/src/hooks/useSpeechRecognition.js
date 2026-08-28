import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const SPEECH_RMS = 0.04;
const SILENCE_MS = 1400;
const MAX_LISTEN_MS = 12000;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      resolve(dataUrl.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function rmsFromTimeDomain(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const value = (bytes[i] - 128) / 128;
    sum += value * value;
  }
  return Math.sqrt(sum / bytes.length);
}

function canRecord() {
  return Boolean(
    typeof window !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
  );
}

/**
 * Records a spoken phrase in the browser and sends it to the backend ears
 * (ElevenLabs Scribe). Chrome's Web Speech API is not used — it depends on
 * Google's network and often fails here with a false "needs internet" error.
 */
export function useSpeechRecognition({ language = 'en', onResult } = {}) {
  const resultRef = useRef(onResult);
  const sessionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  const cleanupSession = useCallback((session) => {
    if (!session) return;
    if (session.raf) cancelAnimationFrame(session.raf);
    session.stream?.getTracks().forEach((track) => track.stop());
    if (session.audioContext && session.audioContext.state !== 'closed') {
      session.audioContext.close().catch(() => {});
    }
  }, []);

  const transcribe = useCallback(
    async (blob, session) => {
      if (session.cancelled) return;
      if (!blob || blob.size < 800) {
        setListening(false);
        setInterim('');
        setError('I could not hear that. Try again in a quieter spot.');
        return;
      }

      setInterim('Writing it down…');
      try {
        const audio = await blobToBase64(blob);
        const { transcript } = await api.transcribe({
          audio,
          mimeType: blob.type || 'audio/webm',
          language,
        });
        const spoken = String(transcript || '').trim();
        if (session.cancelled) return;
        if (!spoken) {
          setError('I could not hear that. Try again in a quieter spot.');
          return;
        }
        setInterim(spoken);
        resultRef.current?.(spoken);
      } catch (problem) {
        if (!session.cancelled) setError(problem.message || 'I could not write down what you said.');
      } finally {
        if (!session.cancelled) {
          setListening(false);
          sessionRef.current = null;
        }
      }
    },
    [language]
  );

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    if (session.raf) cancelAnimationFrame(session.raf);
    if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
    else {
      cleanupSession(session);
      sessionRef.current = null;
      setListening(false);
    }
  }, [cleanupSession]);

  const start = useCallback(async () => {
    if (sessionRef.current) {
      stop();
      return;
    }

    if (!canRecord()) {
      setError('This browser cannot listen. Use Chrome, or type the sale instead.');
      return;
    }

    setError('');
    setInterim('Listening…');
    setListening(true);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setListening(false);
      setInterim('');
      setError('Microphone blocked. Allow mic access in your browser settings.');
      return;
    }

    if (sessionRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    const chunks = [];
    const session = {
      stream,
      recorder,
      chunks,
      cancelled: false,
      stopping: false,
      heardSpeech: false,
      silenceFrom: 0,
      startedAt: Date.now(),
      raf: 0,
      audioContext: null,
    };
    sessionRef.current = session;

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };

    recorder.onerror = () => {
      setError('I could not start the microphone. Tap again.');
      cleanupSession(session);
      sessionRef.current = null;
      setListening(false);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      cleanupSession(session);
      transcribe(blob, session);
    };

    try {
      recorder.start();
    } catch {
      cleanupSession(session);
      sessionRef.current = null;
      setListening(false);
      setError('I could not start the microphone. Tap again.');
      return;
    }

    try {
      const audioContext = new AudioContext();
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      session.audioContext = audioContext;
      const samples = new Uint8Array(analyser.fftSize);

      const tick = () => {
        if (session.stopping || session.cancelled || sessionRef.current !== session) return;
        analyser.getByteTimeDomainData(samples);
        const rms = rmsFromTimeDomain(samples);
        const now = Date.now();

        if (rms >= SPEECH_RMS) {
          session.heardSpeech = true;
          session.silenceFrom = now;
          setInterim('Listening…');
        } else if (session.heardSpeech && now - session.silenceFrom >= SILENCE_MS) {
          stop();
          return;
        } else if (now - session.startedAt >= MAX_LISTEN_MS) {
          stop();
          return;
        }

        session.raf = requestAnimationFrame(tick);
      };
      session.raf = requestAnimationFrame(tick);
    } catch {
      // Silence detection is optional; the shopkeeper can tap the mic to stop.
    }
  }, [cleanupSession, stop, transcribe]);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (!session) return;
      session.cancelled = true;
      if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
      cleanupSession(session);
      sessionRef.current = null;
    },
    [cleanupSession]
  );

  return {
    listening,
    interim,
    error,
    supported: canRecord(),
    start,
    stop,
    setError,
  };
}
