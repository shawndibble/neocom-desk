import { eyebrowClassName } from './eyebrowClassName';
import { forwardRef, type CSSProperties, type ReactNode, type RefObject } from 'react';

interface PanelProps {
  /** Usually text; a title the pilot can edit in place (a Survey's name) passes its own control. */
  /**
   * @summary The panel heading, rendered as an `<h2>`.
   */
  title?: ReactNode;
  /**
   * Exposes the title's own `<h2>` node (tabbable via `tabIndex={-1}` whenever
   * this is set), for a caller that needs to move focus onto it — e.g.
   * Market's item panel, a list-to-detail view where the control that opened
   * this panel disappears on the same render (issue #1485). Left unset, the
   * header renders exactly as before.
   */
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** @summary Right-aligned controls in the header row, usually `IconButton`s. */
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
   *
   * Bare text here inherits the header's small dim type (the group sets it), so a
   * caller passes a string and not a hand-styled span; a `meta` that needs a
   * different tone or `tabular-nums` still sets its own classes.
   */
  meta?: ReactNode;
  /**
   * On a phone, lets `meta` drop to a second line under the title instead of
   * squeezing it: the title stays whole and the left-hand group wraps below
   * `md`. For a header whose `meta` is long enough to crowd the name out —
   * Active Jobs' "N running · N done" plus next-finish line. The caller's
   * `meta` carries `max-md:basis-full` to claim the second line. From `md` up
   * the row is exactly as before.
   */
  wrapMeta?: boolean;
  /**
   * With `wrapMeta`, on a phone gives `meta` the header's full width as a
   * second row beneath the title and `actions`, instead of a second line
   * inside the title's cell (which the `actions` cluster squeezes to a
   * sliver). For a `meta` carrying figures that must not wrap or clip —
   * Production Runs' realized profit. The caller's `meta` carries
   * `max-md:order-last max-md:basis-full`. From `md` up the row is as before.
   */
  metaOwnRow?: boolean;
  children: ReactNode;
  /** @summary Set false for flush content like tables; the body then has no inner padding. */
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
 *
 * @summary The bordered surface every page section sits in: optional title row with meta and actions, then the body.
 */
export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  {
    title,
    headingRef,
    actions,
    leading,
    meta,
    wrapMeta = false,
    metaOwnRow = false,
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
          className={`flex min-h-9 items-center justify-between gap-2 border-b border-line bg-panel-2 py-1 pr-3 ${metaOwnRow ? 'max-md:flex-wrap' : ''} ${leading ? 'pl-1' : 'pl-3'}`}
        >
          <div
            className={`flex min-w-0 items-center gap-2 text-[0.6875rem] text-text-dim ${wrapMeta ? 'max-md:flex-wrap' : ''} ${metaOwnRow ? 'max-md:contents' : ''}`}
          >
            {leading}
            {title && (
              <h2
                ref={headingRef}
                tabIndex={headingRef ? -1 : undefined}
                className={`${eyebrowClassName} ${
                  headingRef
                    ? 'max-md:min-w-0 max-md:break-words md:whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                    : wrapMeta
                      ? 'max-md:shrink-0 max-md:whitespace-nowrap md:min-w-0 md:truncate'
                      : 'min-w-0 truncate'
                }`}
              >
                {title}
              </h2>
            )}
            {meta}
          </div>
          {actions && (
            <div
              className={`flex shrink-0 items-center gap-1 ${metaOwnRow ? 'max-md:ml-auto' : ''}`}
            >
              {actions}
            </div>
          )}
        </header>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
});
