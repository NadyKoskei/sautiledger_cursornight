export const SHELL = 'mx-auto w-full max-w-md lg:max-w-3xl';

export function ScreenHeader({ title, subtitle, action, sticky = true }) {
  return (
    <header
      className={`${sticky ? 'sticky top-0 z-20' : ''} border-b border-line bg-paper/90 backdrop-blur`}
    >
      <div className={`${SHELL} flex items-center justify-between gap-3 px-5 py-4`}>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-sm text-dust">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Screen({ children, className = '' }) {
  return (
    <main className={`${SHELL} px-5 pb-32 pt-5 ${className}`}>{children}</main>
  );
}
