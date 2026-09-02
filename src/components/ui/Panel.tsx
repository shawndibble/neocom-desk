import { forwardRef, type CSSProperties, type ReactNode } from 'react';

interface PanelProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Set false for flush content like tables. */
  padded?: boolean;
  /**
   * Makes the content wrapper itself a `flex min-h-0 flex-1 flex-col` box
   * instead of a plain block div. Without this, a `flex h-full min-h-0
   * flex-col` on `className` never reaches actual children — the wrapper div
   * below breaks the chain, so a `flex-1`/`min-h-0` scroll region inside it
   * silently does nothing and content overflows the panel instead of
   * scrolling. Set true when the panel fills a bounded height and one of its
   * children must scroll within it.
   */
  fill?: boolean;
  className?: string;
  /** Passthrough for values Tailwind can't express statically, e.g. a `top` offset measured at runtime for a `sticky` panel. */
  style?: CSSProperties;
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
 *
 * Forwards its ref to the root `<section>` — needed by, e.g., a `sticky`
 * Panel whose stacking offset is measured at runtime (see PlanEditor.tsx).
 * Wrapping a Panel in a plain `<div>` to get a ref instead doesn't work: it
 * silently breaks that Panel's own `position: sticky` (confirmed — a
 * wrapper div, even with no styling of its own, defeats it).
 */
export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { title, actions, children, padded = true, fill = false, className = '', style },
  ref
) {
  const contentClassName = [padded ? 'p-3' : '', fill ? 'flex min-h-0 flex-1 flex-col' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <section
      ref={ref}
      className={`rounded-xs border border-line bg-panel/85 backdrop-blur-sm ${className}`}
      style={style}
    >
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
      <div className={contentClassName}>{children}</div>
    </section>
  );
});
