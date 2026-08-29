import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Mic, RotateCcw, Send, Square } from 'lucide-react';
import { Card } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { playElevenLabsAudio, stopSpeech } from '../lib/tts';

const DEFAULT_SUGGESTIONS = [
  'What can you do?',
  'What is on my shelf?',
  'How much unga is left?',
  'Who owes me the most?',
];

/**
 * The assistant conversation. Used full-screen on its own route and inside the
 * floating Ask panel, so both share one history-free, self-contained chat.
 */
export function AssistantChat({ className = '', autoFocus = false }) {
  const { business } = useAuth();
  const currency = business?.currency || 'KES';
  const feedRef = useRef(null);
  const inputRef = useRef(null);

  const introText = `Karibu ${business?.owner_name?.split(' ')[0] || ''}. I am Halima, the voice of SautiLedger. I only record what is already on your shelf. Ask what you stock, how much is left, or who owes you.`;

  const [messages, setMessages] = useState([
    {
      id: 'intro',
      role: 'assistant',
      text: introText,
    },
  ]);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .listItems()
      .then(({ items }) => {
        if (!active || !items?.length) return;
        const names = items.slice(0, 3).map((item) => item.name);
        const first = items[0];
        setMessages([
          {
            id: 'intro',
            role: 'assistant',
            text: `Karibu ${business?.owner_name?.split(' ')[0] || ''}. I am Halima for ${business?.business_name || 'your shop'}. I can see ${items.length} items on the shelf, including ${names.join(', ')}. I will not record a sale unless that product is in stock.`,
            data: { items },
          },
        ]);
        setSuggestions([
          'What can you do?',
          'What is on my shelf?',
          `How much ${first.name.toLowerCase()} is left?`,
          'Who owes me the most?',
        ]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [business?.business_name, business?.owner_name]);

  const ask = useCallback(
    async (question) => {
      const text = String(question || '').trim();
      if (!text || busy) return;

      stopSpeech();
      setDraft('');
      setMessages((current) => [...current, { id: crypto.randomUUID?.() || `u-${Date.now()}`, role: 'user', text }]);
      setBusy(true);

      try {
        const { answer, data } = await api.ask(text);
        playElevenLabsAudio(answer, { language: business?.language });
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID?.() || `a-${Date.now()}`, role: 'assistant', text: answer, data },
        ]);
      } catch (error) {
        setMessages((current) => [
          ...current,
          { id: crypto.randomUUID?.() || `e-${Date.now()}`, role: 'assistant', text: error.message, error: true },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [business?.language, busy]
  );

  const speech = useSpeechRecognition({
    language: business?.language,
    onResult: (text) => {
      stopSpeech();
      setDraft(text);
      inputRef.current?.focus();
    },
  });

  function resetChat() {
    speech.cancel();
    stopSpeech();
    setBusy(false);
    setDraft('');
    setMessages([
      {
        id: 'intro',
        role: 'assistant',
        text: introText,
      },
    ]);
  }

  useEffect(() => () => stopSpeech(), []);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={feedRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.map((message) => (
          <Bubble key={message.id} message={message} currency={currency} />
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-dust">
            <Bot size={16} />
            <span className="flex gap-1">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-dust"
                  style={{ animationDelay: `${dot * 120}ms` }}
                />
              ))}
            </span>
          </div>
        )}

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => ask(suggestion)}
                className="rounded-full bg-card px-3 py-2 text-xs font-medium text-ink ring-1 ring-line transition active:scale-95"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(draft);
        }}
        className="shrink-0 pt-2"
      >
        <div className="flex items-center gap-2 rounded-2xl bg-card p-2 shadow-card ring-1 ring-line">
          <input
            ref={inputRef}
            value={speech.listening ? speech.interim || 'Listening…' : draft}
            onChange={(event) => setDraft(event.target.value)}
            readOnly={speech.listening}
            placeholder="Ask about sales, stock, or debts — edit after you speak"
            className="h-10 min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-dust/70"
          />
          <button
            type="button"
            onClick={speech.start}
            aria-label="Ask by voice"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
              speech.listening ? 'bg-clay text-white' : 'bg-grove-light text-grove'
            }`}
          >
            <Mic size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              speech.cancel();
              stopSpeech();
            }}
            aria-label="Stop the voice"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-dust transition hover:bg-line/60 hover:text-ink"
          >
            <Square size={16} />
          </button>
          <button
            type="button"
            onClick={resetChat}
            aria-label="Reset conversation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-dust transition hover:bg-line/60 hover:text-ink"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="submit"
            aria-label="Send question"
            disabled={!draft.trim() || busy}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-grove text-white transition disabled:opacity-40"
          >
            <Send size={18} />
          </button>
        </div>
        {speech.error && <p className="mt-1 px-2 text-xs text-danger">{speech.error}</p>}
      </form>
    </div>
  );
}

function Bubble({ message, currency }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] animate-fade-up rounded-2xl rounded-br-md bg-grove px-4 py-2.5 text-[15px] text-white">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] animate-fade-up">
        <div
          className={`rounded-2xl rounded-bl-md px-4 py-2.5 text-[15px] leading-snug ring-1 ${
            message.error ? 'bg-danger-light text-danger ring-danger/20' : 'bg-card ring-line'
          }`}
        >
          {message.text}
        </div>
        <Evidence data={message.data} currency={currency} />
      </div>
    </div>
  );
}

/** Shows the rows behind the sentence, so the number is always checkable. */
function Evidence({ data, currency }) {
  if (!data) return null;

  if (Array.isArray(data.debtors) && data.debtors.length > 0) {
    return (
      <Card className="mt-2 space-y-1.5 p-3">
        {data.debtors.map((debtor) => (
          <div key={debtor.id} className="flex justify-between text-sm">
            <span className="truncate text-dust">{debtor.name}</span>
            <span className="font-semibold">{money(debtor.balance, { currency })}</span>
          </div>
        ))}
      </Card>
    );
  }

  if (Array.isArray(data.items) && data.items.length > 0) {
    return (
      <Card className="mt-2 space-y-1.5 p-3">
        {data.items.slice(0, 5).map((item) => (
          <div key={item.id || item.name} className="flex justify-between text-sm">
            <span className="truncate text-dust">{item.name}</span>
            <span className="font-semibold">
              {item.qty_on_hand != null
                ? `${item.qty_on_hand} ${item.unit || ''} left`
                : money(item.revenue, { currency })}
            </span>
          </div>
        ))}
      </Card>
    );
  }

  if (data.profit != null) {
    return (
      <Card className="mt-2 grid grid-cols-3 gap-2 p-3 text-center">
        <Metric label="Revenue" value={money(data.revenue, { currency, compact: true })} />
        <Metric label="Cost" value={money(data.cost, { currency, compact: true })} />
        <Metric label="Profit" value={money(data.profit, { currency, compact: true })} />
      </Card>
    );
  }

  return null;
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-dust">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
