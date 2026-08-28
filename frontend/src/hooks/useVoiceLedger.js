import { useCallback, useState } from 'react';
import { api } from '../lib/api';
import { playElevenLabsAudio } from '../lib/tts';
import { useAuth } from '../context/AuthContext.jsx';
import { useSpeechRecognition } from './useSpeechRecognition';

/**
 * Ears → intent → deterministic ledger → mouth.
 *
 * The browser hears the words, the backend parses them into an intent, and
 * Postgres decides what the numbers are. The spoken reply is whatever the
 * database sends back, never a figure assembled on the client.
 */
export function useVoiceLedger({ scope = 'sale', onRecorded } = {}) {
  const { business } = useAuth();
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [problem, setProblem] = useState('');

  const submit = useCallback(
    async (spoken, { source = 'voice' } = {}) => {
      const text = String(spoken || '').trim();
      if (!text) return null;

      setTranscript(text);
      setProblem('');
      setBusy(true);

      try {
        const intent = await api.parseIntent(text);

        if (intent.action === 'ask') {
          playElevenLabsAudio(intent.answer, { language: business?.language });
          setReceipt({ action: 'ask', message: intent.answer, data: intent.data, lines: [] });
          return intent;
        }

        if (scope === 'restock' && intent.action !== 'repayment' && intent.action !== 'ask') {
          intent.action = 'restock';
        }

        const result = await api.recordTransaction({ ...intent, source, transcript: text });

        playElevenLabsAudio(result.message, { language: business?.language });
        setReceipt({ ...result.receipt, message: result.message, intent });
        onRecorded?.(result);
        return result;
      } catch (error) {
        setProblem(error.message);
        playElevenLabsAudio(error.message, { language: business?.language });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [business?.language, onRecorded, scope]
  );

  const speech = useSpeechRecognition({
    language: business?.language,
    onResult: (text) => submit(text),
  });

  const reset = useCallback(() => {
    setReceipt(null);
    setTranscript('');
    setProblem('');
    speech.setError('');
  }, [speech]);

  return {
    listening: speech.listening,
    interim: speech.interim,
    supported: speech.supported,
    error: problem || speech.error,
    transcript,
    receipt,
    busy,
    start: speech.start,
    submit,
    reset,
  };
}
