export function ScreenHeader({ title, subtitle, action, sticky = true }) {
  return (
    <header
      className={`${sticky ? 'sticky top-0 z-20' : ''} border-b border-line bg-paper/90 backdrop-blur`}
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 py-3.5">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-dust">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Screen({ children, className = '' }) {
  return (
    <main className={`mx-auto max-w-md px-5 pb-32 pt-4 ${className}`}>{children}</main>
  );
}
