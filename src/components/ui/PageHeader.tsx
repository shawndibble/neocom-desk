import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

interface PageHeaderProps {
  /** Already-translated page title. Rendered as the route's one `<h1>`. */
  title: string;
  /**
   * Sits immediately after the title, sharing its baseline: the view's
   * `DataAgeBadge`, a stat strip, a count. Reads as part of the title, not as
   * a control — put anything clickable in `actions`.
   */
  meta?: ReactNode;
  /** Right-aligned control cluster. `IconButton`s, in the order they're used. */
  actions?: ReactNode;
  /**
   * A route's sub-navigation, on the title's own line instead of below it.
   *
   * The default stack — title band, then a `Tabs`/`NavLink` bar, then the first
   * panel's own header — is three rules before any data, which is most of a
   * dense route's wasted vertical space (issue #566). Passing the bar here
   * puts all three of title, tabs and actions on one line and lets this header
   * draw the single hairline they share, so the sub-nav should use
   * `tabListFlushClassName` rather than bringing a second baseline.
   */
  subNav?: ReactNode;
  className?: string;
}

/**
 * Every route's top line: title, then its data age, then its controls.
 *
 * Before this, fourteen routes hand-rolled the same header and had drifted —
 * some pushed the actions to the far edge with `justify-between` (leaving a
 * hand's width of dead space beside a one-word title), some hid the
 * `DataAgeBadge` down inside a panel instead, and three had no `<h1>` at all.
 * The badge belongs beside the title because it describes the whole view, and
 * one `<h1>` per route is what a screen reader's heading list is for.
 *
 * `min-h-11 md:min-h-9` reserves the touch-tier `IconButton`'s own height
 * (`size-11 md:size-9`) whether or not this route passes `actions` — a route
 * without any (just the `<h1>`) would otherwise render a shorter header than
 * one with icon actions, and everything below it (a `Tabs` sub-nav, most
 * visibly) would sit at a different height route to route, jumping as you
 * switch between them on the bottom tab bar.
 */
export function PageHeader({ title, meta, actions, subNav, className = '' }: PageHeaderProps) {
  return (
    <header
      className={cx(
        'flex min-h-11 flex-wrap gap-2 md:min-h-9',
        // With a sub-nav the header *is* the tab bar's baseline, so everything
        // in it aligns to that rule rather than to the row's centre. Without
        // one, nothing changes for the thirteen routes already using this.
        subNav ? 'items-end gap-x-5 border-b border-line' : 'items-center',
        className
      )}
    >
      <h1 className="text-xl font-semibold tracking-widest uppercase">{title}</h1>
      {meta}
      {subNav && (
        <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">{subNav}</div>
      )}
      {actions && (
        <div className={cx('ml-auto flex items-center gap-1.5', subNav ? 'pb-1' : undefined)}>
          {actions}
        </div>
      )}
    </header>
  );
}
