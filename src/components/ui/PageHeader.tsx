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
export function PageHeader({ title, meta, actions, className = '' }: PageHeaderProps) {
  return (
    <header className={cx('flex min-h-11 flex-wrap items-center gap-2 md:min-h-9', className)}>
      <h1 className="text-xl font-semibold tracking-widest uppercase">{title}</h1>
      {meta}
      {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </header>
  );
}
