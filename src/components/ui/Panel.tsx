import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Set false for flush content like tables. */
  padded?: boolean;
  className?: string;
}

export function Panel({ title, actions, children, padded = true, className = '' }: PanelProps) {
  return (
    <section className={`rounded-xs border border-line bg-panel/85 backdrop-blur-sm ${className}`}>
      {(title || actions) && (
        <header className="flex min-h-8 items-center justify-between gap-2 border-b border-line px-3 py-1">
          {title && (
            <h2 className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
              {title}
            </h2>
          )}
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-3' : ''}>{children}</div>
    </section>
  );
}
