import { forwardRef, type CSSProperties, type ReactNode, type RefObject } from 'react';

interface PanelProps {
  title?: string;
  /**
   * Exposes the title's own `<h2>` node (tabbable via `tabIndex={-1}` whenever
   * this is set), for a caller that needs to move focus onto it — e.g.
   * Market's item panel, a list-to-detail view where the control that opened
   * this panel disappears on the same render (issue #1485). Left unset, the
   * header renders exactly as before.
   */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  actions?: ReactNode;
  /**
   * Sits to the left of the title, inside the same left-hand group. For a
   * control that belongs *to* the title rather than beside it — the Market
   * Browser's mobile back arrow, which reads as "back from this item", not as
   * a panel-wide action parked on the far right.
   */
  leading?: ReactNode;
  /**
   * Sits to the right of the title, in the same left-hand group: a one-line
   * read of what the panel holds (a count, a total, a countdown), so a
   * collapsed panel still says something without opening it.
   *
   * A control belongs here only when it names *what is being read* rather than
   * acting on it — the Character filter on Active Jobs and Wallet Balance is
   * the subject of the count beside it, and has to outlive the fold that hides
   * the body. Anything that acts on the panel goes in `actions`; a control
   * belonging to the title itself goes in `leading`. This group does not wrap,
   * so a `meta` holding more than one thing carries its own `flex-wrap`.
   */
  meta?: ReactNode;
  children: ReactNode;
  /**
   * Lets `actions` take the header's free width instead of hugging the right
   * edge — for a header whose actions *are* the toolbar, like the History
   * tab's phone view toggle, which needs the row to be tappable at all.
   */
  actionsFill?: boolean;
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
 * Forwards its ref to the root `<section>`, for a caller that has to measure
 * or observe the panel's own box. Wrapping a Panel in a plain `<div>` to get
 * a ref instead doesn't work: it silently breaks that Panel's own
 * `position: sticky` (confirmed — a wrapper div, even with no styling of its
 * own, defeats it).
 */
export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  {
    title,
    headingRef,
    actions,
    actionsFill = false,
    leading,
    meta,
    children,
    padded = true,
    fill = false,
    className = '',
    style,
  },
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
      {(title || actions || leading || meta) && (
        // A `leading` control carries its own tap padding, so the header's
        // own left inset would read as a double gap — drop it and let the
        // control sit against the edge, the way `Assets`' breadcrumb bar does.
        <header
          className={`flex min-h-11 items-center justify-between gap-2 border-b border-line bg-panel-2 py-1 pr-3 md:min-h-9 ${leading ? 'pl-1' : 'pl-3'}`}
        >
          {/* An empty left group would still cost the header's gap before filling actions. */}
          {(!actionsFill || leading || title || meta) && (
            <div className="flex min-w-0 items-center gap-2">
              {leading}
              {title && (
                <h2
                  ref={headingRef}
                  tabIndex={headingRef ? -1 : undefined}
                  className={`text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase ${
                    headingRef
                      ? 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                      : ''
                  }`}
                >
                  {title}
                </h2>
              )}
              {meta}
            </div>
          )}
          {actions && (
            <div className={`flex items-center gap-1 ${actionsFill ? 'min-w-0 flex-1' : ''}`}>
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
});
