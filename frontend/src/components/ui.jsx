export function Button({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  ...props
}) {
  const variants = {
    primary: 'bg-grove text-white hover:bg-grove-dark disabled:bg-grove/50',
    secondary: 'bg-card text-ink ring-1 ring-line hover:bg-paper',
    ghost: 'text-grove hover:bg-grove-light',
    danger: 'bg-danger text-white hover:brightness-95',
  };
  const sizes = {
    sm: 'h-9 px-3 text-sm rounded-xl',
    md: 'h-12 px-4 text-[15px] rounded-2xl',
    lg: 'h-14 px-5 text-base rounded-2xl',
  };

  return (
    <Tag
      className={`inline-flex items-center justify-center gap-2 font-semibold transition
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grove focus-visible:ring-offset-2
        focus-visible:ring-offset-paper active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70
        ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </Tag>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-dust">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`h-12 w-full rounded-2xl border border-line bg-card px-4 text-[15px] text-ink
        placeholder:text-dust/70 focus:border-grove focus:outline-none focus:ring-2 focus:ring-grove/20
        ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`h-12 w-full appearance-none rounded-2xl border border-line bg-card px-4 text-[15px]
        text-ink focus:border-grove focus:outline-none focus:ring-2 focus:ring-grove/20 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`rounded-2xl bg-card p-4 shadow-card ring-1 ring-line/60 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function SegmentedControl({ options, value, onChange, size = 'md' }) {
  return (
    <div
      role="tablist"
      className={`flex gap-1 rounded-2xl bg-line/40 p-1 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-xl px-3 py-2 font-semibold transition ${
              active ? 'bg-card text-ink shadow-sm' : 'text-dust hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-line/50 text-dust',
    sale: 'bg-grove-light text-grove',
    credit: 'bg-warn-light text-warn',
    repayment: 'bg-card text-grove ring-1 ring-grove/40',
    ask: 'bg-grove-light text-grove',
    danger: 'bg-danger-light text-danger',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tones[tone] || tones.neutral}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      {Icon && (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-grove-light text-grove">
          <Icon size={22} />
        </span>
      )}
      <p className="font-display text-lg font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-dust">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-shimmer rounded-2xl bg-line/40 ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(230,220,201,0.35) 0px, rgba(255,253,248,0.9) 200px, rgba(230,220,201,0.35) 400px)',
        backgroundSize: '800px 100%',
      }}
    />
  );
}

export function Sheet({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[88vh] w-full max-w-md animate-sheet-up overflow-y-auto rounded-t-3xl bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        {title && <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
