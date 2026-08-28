import { Loader2, Mic } from 'lucide-react';

const SIZES = {
  lg: { button: 'h-36 w-36', icon: 52 },
  md: { button: 'h-24 w-24', icon: 34 },
  sm: { button: 'h-12 w-12', icon: 20 },
};

export function MicButton({
  listening,
  busy = false,
  size = 'lg',
  label = 'Start listening',
  onClick,
  className = '',
}) {
  const dimensions = SIZES[size] || SIZES.lg;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={listening}
      aria-label={listening ? 'Stop listening' : label}
      className={`relative flex items-center justify-center rounded-full text-white shadow-mic
        transition active:scale-95 focus-visible:outline-none focus-visible:ring-4
        focus-visible:ring-grove/30 ${listening ? 'bg-clay' : 'bg-grove'} ${dimensions.button} ${className}`}
    >
      {listening && (
        <>
          <span className="pointer-events-none absolute inset-0 animate-ripple rounded-full bg-clay/40" />
          <span
            className="pointer-events-none absolute inset-0 animate-ripple rounded-full bg-clay/30"
            style={{ animationDelay: '0.5s' }}
          />
        </>
      )}
      {busy ? (
        <Loader2 size={dimensions.icon} className="animate-spin" />
      ) : (
        <Mic size={dimensions.icon} strokeWidth={1.75} />
      )}
    </button>
  );
}
