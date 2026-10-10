import { useContext, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { AlertsBell } from './AlertsBell';
import { UnreadAlertsContext } from './unreadAlertsContext';

interface PageHeaderProps {
  /** Already-translated page title. Rendered as the route's one `<h1>`. */
  title: string;
  /**
   * Sits immediately after the title, sharing its baseline: the view's
   * `DataAgeBadge`, a stat strip, a count. Reads as part of the title, not as
   * a control — put anything clickable in `actions`. Exception: a
   * `CharacterFilterControl` may sit here too, on the same "names whose data
   * this is" rationale `Panel.meta` uses per
   * `docs/context/decisions/20260908-192806-the-character-filter-rides-in-the-panel-header.md`,
   * when the route has no titled inner `Panel` of its own to host it (see
   * `Assets.tsx`, `OverviewTab.tsx`).
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
 *
 * No phone-only "whose data is this" avatar lives here any more (#1764 added
 * one, since removed): a route that filters by Character already carries
 * that cue in its `CharacterFilterControl`, whose trigger shows the active
 * Character's own portrait below `md`. A route with one Character to offer,
 * and so no filter control, has nothing to name here either — the bottom
 * tab bar's More sheet is still a phone's route to Characters either way.
 */
export function PageHeader({ title, meta, actions, subNav, className = '' }: PageHeaderProps) {
  // The bell joins the cluster only while it has something to say, so a route
  // with no actions still draws no empty wrapper.
  const hasAlerts = useContext(UnreadAlertsContext) > 0;
  return (
    <header
      className={cx(
        'flex min-h-11 flex-wrap gap-2 md:min-h-9',
        // With a sub-nav the header *is* the tab bar's baseline, so everything
        // in it aligns to that rule rather than to the row's centre. Without
        // one, nothing changes for the thirteen routes already using this.
        subNav ? 'items-end md:gap-x-5 border-b border-line' : 'items-center',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 self-stretch md:contents">
        {/* `tabIndex={-1}`: route focus (`app/routeFocus.ts`) lands here after navigation. */}
        <h1
          tabIndex={-1}
          className="min-w-0 text-xl font-semibold tracking-widest break-words uppercase focus:outline-none"
        >
          {title}
        </h1>
        {meta}
        {(actions || hasAlerts) && (
          // `md:order-1`: after the sub-nav, which sits between meta and actions at `md`.
          <div
            className={cx(
              'ml-auto flex flex-wrap items-center justify-end gap-1.5 md:order-1',
              subNav ? 'md:pb-1' : undefined
            )}
          >
            {actions}
            <AlertsBell />
          </div>
        )}
      </div>
      {subNav && (
        <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">{subNav}</div>
      )}
    </header>
  );
}
