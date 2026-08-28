import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Maximize2, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AssistantChat } from './AssistantChat.jsx';

/**
 * The assistant follows the shopkeeper around: a floating button that sits just
 * above the bottom nav on every screen, opening into a panel over the page.
 */
export function AskAssistant() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // A route change should never leave the panel hanging over the new screen.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // The dedicated screen already is the chat.
  if (pathname === '/assistant') return null;

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close assistant"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px]"
        />
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md px-5">
        {open ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ask SautiLedger"
            className="pointer-events-auto flex h-[65dvh] animate-fade-up flex-col rounded-3xl bg-paper p-4 shadow-card ring-1 ring-line"
          >
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-grove-light text-grove">
                  <Sparkles size={16} />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight">Ask SautiLedger</p>
                  <p className="text-[11px] leading-tight text-dust">Answers from your ledger</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Link
                  to="/assistant"
                  aria-label="Open full screen"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-dust transition hover:bg-line/60 hover:text-ink"
                >
                  <Maximize2 size={16} />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close assistant"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-dust transition hover:bg-line/60 hover:text-ink"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <AssistantChat className="flex-1" autoFocus />
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white shadow-card transition active:scale-95"
            >
              <Sparkles size={16} />
              Ask
            </button>
          </div>
        )}
      </div>
    </>
  );
}
