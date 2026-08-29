import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  warn: AlertTriangle,
  info: Info,
};

const TONES = {
  success: 'bg-grove text-white',
  error: 'bg-danger text-white',
  warn: 'bg-warn text-white',
  info: 'bg-ink text-white',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message, tone = 'info') => {
      const id = globalThis.crypto?.randomUUID?.() || `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current, { id, message, tone }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.tone] || Info;
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-md animate-fade-up items-start gap-2 rounded-2xl px-4 py-3 text-sm shadow-card ${TONES[toast.tone]}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1 leading-snug">{toast.message}</p>
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
