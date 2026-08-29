import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { playElevenLabsAudio, stopSpeech, subscribeSpeaking } from '../lib/tts';
import { useAuth } from '../context/AuthContext.jsx';
import { useSpeechRecognition } from './useSpeechRecognition';

function composeSpoken(draft, creditName, asCredit) {
  const spoken = String(draft || '').trim();
  const who = String(creditName || '').trim();
  if (!spoken) return '';
  if (!asCredit || !who) return spoken;
  if (new RegExp(`\\bto\\s+${who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(spoken)) {
    return spoken;
  }
  if (/\b(credit|deni|mkopo|on\s+account)\b/i.test(spoken)) {
    return `${spoken} to ${who}`;
  }
  return `${spoken} credit to ${who}`;
}

/**
 * Ears → optional edit → intent → deterministic ledger → mouth.
 *
 * Speech is not written to the books until the shopkeeper confirms. They can
 * stop the spoken reply, reset, fix the transcript, and append a credit name.
 */
export function useVoiceLedger({ scope = 'sale', onRecorded } = {}) {
  const { business } = useAuth();
  const runId = useRef(0);
  const cancelListenRef = useRef(() => {});
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [draft, setDraft] = useState('');
  const [creditName, setCreditName] = useState('');
  const [asCredit, setAsCredit] = useState(false);
  const [preview, setPreview] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [problem, setProblem] = useState('');

  useEffect(() => subscribeSpeaking(setSpeaking), []);

  const spokenLine = composeSpoken(draft, creditName, asCredit);

  const halt = useCallback(() => {
    runId.current += 1;
    cancelListenRef.current();
    stopSpeech();
    setBusy(false);
  }, []);

  const submit = useCallback(
    async (spoken, { source = 'voice' } = {}) => {
      const text = String(spoken || '').trim();
      if (!text) return null;

      const id = ++runId.current;
      setProblem('');
      setBusy(true);
      stopSpeech();

      try {
        const intent = await api.parseIntent(text);
        if (id !== runId.current) return null;

        if (intent.action === 'ask') {
          playElevenLabsAudio(intent.answer, { language: business?.language });
          setReceipt({ action: 'ask', message: intent.answer, data: intent.data, lines: [] });
          return intent;
        }

        if (intent.clarification) {
          setProblem(intent.clarification);
          playElevenLabsAudio(intent.clarification, { language: business?.language });
          return intent;
        }

        if (intent.items?.some((item) => item.matched === false)) {
          const missing = intent.items.find((item) => item.matched === false);
          const message = `${missing.name} is not in your inventory.`;
          setProblem(message);
          playElevenLabsAudio(message, { language: business?.language });
          return intent;
        }

        if (scope === 'restock' && intent.action !== 'repayment' && intent.action !== 'ask') {
          intent.action = 'restock';
        }

        if (asCredit && intent.action !== 'repayment' && intent.action !== 'restock') {
          const who = creditName.trim() || intent.customer_name;
          if (!who) {
            setProblem('Name the person who took these items on credit.');
            setBusy(false);
            return null;
          }
          if (!intent.items?.length) {
            setProblem('Say which items they took, then record on credit.');
            setBusy(false);
            return null;
          }
          intent.action = 'credit';
          intent.payment_type = 'credit';
          intent.customer_name = who;
        }

        const result = await api.recordTransaction({ ...intent, source, transcript: text });
        if (id !== runId.current) return null;

        playElevenLabsAudio(result.message, { language: business?.language });
        setReceipt({ ...result.receipt, message: result.message, intent });
        setProblem('');
        onRecorded?.(result);
        return result;
      } catch (error) {
        if (id !== runId.current) return null;
        setProblem(error.message);
        playElevenLabsAudio(error.message, { language: business?.language });
        return null;
      } finally {
        if (id === runId.current) setBusy(false);
      }
    },
    [asCredit, business?.language, creditName, onRecorded, scope]
  );

  const speech = useSpeechRecognition({
    language: business?.language,
    onResult: (text) => {
      setDraft(text);
      setReceipt(null);
      setProblem('');
    },
  });
  cancelListenRef.current = speech.cancel;

  useEffect(() => {
    const text = spokenLine;
    if (!text) {
      setPreview(null);
      return undefined;
    }

    const timer = setTimeout(() => {
      api
        .parseIntent(text)
        .then((intent) => setPreview(intent))
        .catch(() => setPreview(null));
    }, 280);

    return () => clearTimeout(timer);
  }, [spokenLine]);

  useEffect(() => {
    if (preview?.action !== 'credit') return;
    setAsCredit(true);
    if (preview.customer_name) {
      setCreditName((current) => (current.trim() ? current : preview.customer_name));
    }
  }, [preview]);

  const start = useCallback(() => {
    stopSpeech();
    setProblem('');
    speech.start();
  }, [speech]);

  const stop = useCallback(() => {
    halt();
  }, [halt]);

  const reset = useCallback(() => {
    halt();
    speech.setError('');
    setReceipt(null);
    setDraft('');
    setCreditName('');
    setAsCredit(false);
    setPreview(null);
    setProblem('');
  }, [halt, speech]);

  const commit = useCallback(() => submit(spokenLine), [spokenLine, submit]);

  return {
    listening: speech.listening,
    interim: speech.interim,
    supported: speech.supported,
    error: problem || speech.error,
    draft,
    setDraft,
    creditName,
    setCreditName,
    asCredit,
    setAsCredit,
    preview,
    spokenLine,
    receipt,
    busy,
    speaking,
    start,
    stop,
    submit: commit,
    reset,
  };
}
