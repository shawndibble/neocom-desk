import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { AlertsBell } from './AlertsBell';
import { PageHeaderClusterContext } from './pageHeaderCluster';

interface PageHeaderProps {
  /**
   * @summary Already-translated page title, rendered as the route's one `<h1>`.
   */
  title: string;
  /**
   * Sits immediately after the title, sharing its baseline: the view's
   * `DataAgeBadge`, a stat strip, a count. Reads as part of the title, not as
   * a control — put anything clickable in `actions`, and the Character
   * picker in `scope`. With `scope` set, meta stays on the title's line and
   * clips rather than wrapping, so keep it short.
   */
  meta?: ReactNode;
  /**
   * The page's one `CharacterFilterControl` (This character / All characters
   * / Corporation), rendered first in the right-hand cluster, before
   * `actions`. In this slot the control takes the header's touch tier
   * (44px tall below `md`, 36px from `md` up; an avatar stack with no words)
   * on its own, through
   * `PageHeaderClusterContext`, so it is always level with the `IconButton`s
   * beside it.
   *
   * Passing it also locks the title row to one line at every width: the
   * `<h1>` truncates (its full text in `title`), `meta` shrinks and clips,
   * and the cluster never wraps or shrinks. A page with more actions than a
   * phone row holds moves the rare ones into a `HeaderMoreMenu` below the
   * breakpoint, deciding in JS rather than with CSS. See
   * `docs/context/decisions/20261022-123837-the-character-picker-rides-first-in-the-page.md`.
   *
   * The lock keys on the prop, not on what renders: a picker that renders
   * nothing (a one-Character account) still leaves the header single-line.
   * That is intended — a page must fit its row through the ⋮ either way, so
   * its layout does not change when a second Character is added.
   *
   * @summary The page's Character picker, first in the right-hand cluster; locks the header to one line.
   */
  scope?: ReactNode;
  /**
   * The page's controls, after `scope`, in this fixed order: text-labelled
   * page actions (Compose, Payees, a labelled Export…), then icon-only ones
   * (Refresh), then the `HeaderMoreMenu` ⋮ or a settings gear last. The
   * `AlertsBell` follows on its own.
   *
   * @summary Right-aligned control cluster: text actions, icon actions (Refresh), then ⋮ or gear.
   */
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
 *
 * The right-hand cluster's order is fixed on every page: `scope` (the
 * Character picker) → text-labelled page actions → icon-only actions
 * (Refresh) → ⋮ More actions (`HeaderMoreMenu`) or a settings gear →
 * `AlertsBell`: words on the left, icons on the right. With `scope` set the whole title row
 * stays on one line (see that prop); without it the row wraps as it always
 * has.
 *
 * @summary A route's top line: the one `<h1>`, its data age beside it, and the page controls at the right.
 */
export function PageHeader({
  title,
  meta,
  scope,
  actions,
  subNav,
  className = '',
}: PageHeaderProps) {
  // A scope picker locks the title row to one line (decision 20261022-123837): the
  // title and meta give way, the control cluster never does.
  const singleLine = scope !== undefined && scope !== null && scope !== false;
  return (
    <header
      className={cx(
        'flex min-h-11 flex-wrap gap-2 md:min-h-9',
        // Below `md` the sub-nav still needs its own wrapped line; from `md` up
        // everything shares one row and must not wrap.
        singleLine && 'md:flex-nowrap',
        // With a sub-nav the header *is* the tab bar's baseline, so everything
        // in it aligns to that rule rather than to the row's centre. Without
        // one, nothing changes for the thirteen routes already using this.
        subNav ? 'items-end md:gap-x-5 border-b border-line' : 'items-center',
        className
      )}
    >
      <div
        className={cx(
          'flex min-w-0 flex-1 items-center gap-2 self-stretch md:contents',
          singleLine ? 'flex-nowrap' : 'flex-wrap'
        )}
      >
        {/* `tabIndex={-1}`: route focus (`app/routeFocus.ts`) lands here after navigation. */}
        <h1
          tabIndex={-1}
          title={singleLine ? title : undefined}
          className={cx(
            'max-w-full text-xl font-semibold tracking-widest uppercase focus:outline-none',
            singleLine ? 'min-w-12 shrink truncate' : 'min-w-0 shrink-0 break-words'
          )}
        >
          {title}
        </h1>
        {singleLine
          ? meta && (
              // Shrinks before the title does (the larger factor), and clips.
              // `p-1 -m-1`: room inside the clip for a focusable item's focus
              // ring (the `DataAgeBadge`'s `<time tabIndex=0>`); `min-w-10`
              // keeps a tabbable item from collapsing to nothing. An empty wrapper,
              // or one whose only child is an empty portal target (Market's
              // tab-filled meta slot), is hidden so it holds no room or gap; so is
              // one whose one child is itself hidden below `md` (a `DataAgeBadge`).
              <div className="-m-1 flex min-w-10 shrink-[4] items-center gap-2 overflow-hidden p-1 whitespace-nowrap empty:hidden has-[>:only-child:empty]:hidden max-md:has-[>.hidden:only-child]:hidden">
                {meta}
              </div>
            )
          : meta}
        {/* `md:order-1`: after the sub-nav, which sits between meta and actions at `md`. The bell is always there (dim at zero), so the cluster never collapses. */}
        <div
          className={cx(
            'ml-auto flex items-center justify-end gap-1.5 md:order-1',
            singleLine
              ? 'shrink-0 flex-nowrap'
              : // `min-w-0 max-w-full`: a full-width nowrap action truncates instead of pushing the page sideways.
                'max-w-full min-w-0 flex-wrap',
            subNav ? 'md:pb-1' : undefined
          )}
        >
          {/* Only `scope`: the context would otherwise reach through portals into modals an action opens. */}
          <PageHeaderClusterContext.Provider value={true}>
            {scope}
          </PageHeaderClusterContext.Provider>
          {actions}
          <AlertsBell />
        </div>
      </div>
      {subNav && (
        <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">{subNav}</div>
      )}
    </header>
  );
}
