import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Set false for flush content like tables. */
  padded?: boolean;
  className?: string;
}

/**
 * Base surface. Everything lives in a Panel; don't nest them — use `panel-2`
 * fills inside.
 *
 * The header carries a `panel-2` fill rather than a bare hairline. It reads as
 * the panel's own toolbar that way, which is what anchors a flush table to a
 * frame instead of leaving it floating on the page background — the Assets
 * list had already discovered this and hand-rolled the strip locally. Its
 * minimum height is the `md` control tier, because what sits in `actions` is
 * usually an `IconButton` at exactly that height.
 */
export function Panel({ title, actions, children, padded = true, className = '' }: PanelProps) {
  return (
    <section className={`rounded-xs border border-line bg-panel/85 backdrop-blur-sm ${className}`}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-1 md:min-h-9">
          {title && (
            <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
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
