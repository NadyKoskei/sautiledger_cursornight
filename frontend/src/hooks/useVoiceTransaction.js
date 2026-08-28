import { useCallback, useRef, useState } from 'react';
import { playElevenLabsAudio } from '../lib/tts';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PLACEHOLDER_LOG = [
  {
    id: 'p1',
    type: 'sale',
    label: 'Unga × 2',
    detail: 'Cash',
    total: 300,
    time: '09:14',
  },
  {
    id: 'p2',
    type: 'credit',
    label: 'Sugar × 1',
    detail: 'Mama Jane',
    total: 280,
    time: '10:02',
  },
  {
    id: 'p3',
    type: 'repayment',
    label: 'Repayment',
    detail: 'Mama Jane',
    total: 500,
    time: '11:30',
  },
];

export function useVoiceTransaction() {
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [lastMessage, setLastMessage] = useState('');
  const [error, setError] = useState('');
  const [log, setLog] = useState(PLACEHOLDER_LOG);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const processTranscript = useCallback(async (spoken) => {
    setStatus('parsing');
    setError('');

    const parseRes = await fetch(`${API_BASE}/api/parse-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: spoken }),
    });

    if (!parseRes.ok) {
      throw new Error('Could not parse that speech. Try again.');
    }

    const intent = await parseRes.json();
    setStatus('recording');

    const txRes = await fetch(`${API_BASE}/api/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent),
    });

    const payload = await txRes.json();
    const message = payload.message || 'Recorded.';

    if (!txRes.ok) {
      throw new Error(message);
    }

    playElevenLabsAudio(message);
    setLastMessage(message);
    setLog((current) => [
      {
        id: crypto.randomUUID(),
        type: intent.action,
        label:
          intent.items?.length > 0
            ? intent.items.map((item) => `${item.name} × ${item.qty}`).join(', ')
            : 'Repayment',
        detail:
          intent.customer_name ||
          (intent.payment_type === 'credit' ? 'Credit' : 'Cash'),
        total: null,
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        spoken: message,
      },
      ...current,
    ]);
    setStatus('done');
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('This browser does not support speech recognition.');
      setStatus('error');
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-KE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus('listening');
      setError('');
      setLastMessage('');
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setStatus('error');
      setError(
        event.error === 'not-allowed'
          ? 'Microphone permission was blocked.'
          : 'Could not hear that. Tap the mic and try again.'
      );
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onresult = async (event) => {
      const spoken = event.results[0][0].transcript;
      setTranscript(spoken);

      try {
        await processTranscript(spoken);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong.';
        setError(message);
        setStatus('error');
        playElevenLabsAudio(message);
      }
    };

    recognition.start();
  }, [isListening, processTranscript, stopListening]);

  return {
    isListening,
    status,
    transcript,
    lastMessage,
    error,
    log,
    startListening,
  };
}
