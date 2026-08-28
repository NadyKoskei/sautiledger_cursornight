import { Banknote, Download, Mic, NotebookPen, Share, Volume2, X } from 'lucide-react';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useVoiceTransaction } from './hooks/useVoiceTransaction';

const STATUS_COPY = {
  idle: 'Tap the mic. Speak a sale, credit, or repayment.',
  listening: 'Listening… say it like you would in the duka.',
  parsing: 'Turning speech into an intent…',
  recording: 'Writing it to the ledger…',
  done: 'Recorded. Ready for the next line.',
  error: 'That one did not land. Tap and try again.',
};

function TypeBadge({ type }) {
  const styles = {
    sale: 'bg-grove/10 text-grove',
    credit: 'bg-amber-100 text-amber-800',
    repayment: 'bg-sky-100 text-sky-800',
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles[type] || styles.sale}`}
    >
      {type}
    </span>
  );
}

function InstallBanner({ canInstall, showIosTip, onInstall, onDismiss }) {
  if (!canInstall && !showIosTip) return null;

  return (
    <div className="border-b border-black/5 bg-grove text-white">
      <div className="mx-auto flex max-w-md items-start gap-3 px-5 py-3">
        {canInstall ? (
          <button
            type="button"
            onClick={onInstall}
            className="flex flex-1 items-center gap-2 text-left text-sm font-medium"
          >
            <Download size={16} className="shrink-0" />
            Install SautiLedger on this phone
          </button>
        ) : (
          <p className="flex flex-1 items-start gap-2 text-sm font-medium leading-snug">
            <Share size={16} className="mt-0.5 shrink-0" />
            On iPhone: Share → Add to Home Screen
          </p>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss install tip"
          className="rounded-full p-1 text-white/80"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const {
    isListening,
    status,
    transcript,
    lastMessage,
    error,
    log,
    startListening,
  } = useVoiceTransaction();
  const { canInstall, showIosTip, install, dismiss } = usePwaInstall();

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <InstallBanner
        canInstall={canInstall}
        showIosTip={showIosTip}
        onInstall={install}
        onDismiss={dismiss}
      />
      <header className="sticky top-0 z-20 border-b border-black/5 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-clay">
              Duka
            </p>
            <h1 className="font-display text-2xl font-semibold leading-none">
              SautiLedger
            </h1>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-grove text-white">
            <NotebookPen size={18} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col px-5 pb-10">
        <section className="flex flex-col items-center pb-8 pt-10">
          <p className="mb-8 max-w-[16rem] text-center text-sm leading-relaxed text-dust">
            {STATUS_COPY[status] || STATUS_COPY.idle}
          </p>

          <button
            type="button"
            onClick={startListening}
            aria-pressed={isListening}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
            className="relative flex h-36 w-36 items-center justify-center rounded-full bg-grove text-white shadow-mic transition active:scale-95"
          >
            {isListening && (
              <span className="mic-ring pointer-events-none absolute inset-0 rounded-full border-2 border-grove" />
            )}
            <Mic size={52} strokeWidth={1.75} />
          </button>

          <p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-dust">
            {isListening ? 'Listening' : 'Hold the shop in your voice'}
          </p>

          {(transcript || lastMessage || error) && (
            <div className="mt-6 w-full rounded-2xl bg-white/70 p-4 shadow-sm ring-1 ring-black/5">
              {transcript && (
                <p className="text-sm text-dust">
                  Heard: <span className="text-ink">{transcript}</span>
                </p>
              )}
              {lastMessage && (
                <p className="mt-2 flex items-start gap-2 text-sm font-medium text-grove">
                  <Volume2 size={16} className="mt-0.5 shrink-0" />
                  {lastMessage}
                </p>
              )}
              {error && <p className="mt-2 text-sm font-medium text-clay">{error}</p>}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Today</h2>
            <span className="text-xs text-dust">{log.length} entries</span>
          </div>

          <ul className="space-y-2">
            {log.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-2xl bg-white/80 px-4 py-3 ring-1 ring-black/5"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <TypeBadge type={entry.type} />
                    <span className="text-[11px] text-dust">{entry.time}</span>
                  </div>
                  <p className="truncate font-medium capitalize">{entry.label}</p>
                  <p className="text-xs text-dust">{entry.detail}</p>
                </div>
                {entry.total != null && (
                  <div className="ml-3 flex items-center gap-1 text-sm font-semibold">
                    <Banknote size={14} className="text-grove" />
                    {entry.total}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
