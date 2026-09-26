import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, useInRouterContext, useLocation } from 'react-router-dom';
import { db } from '@/db';
import { cx } from '@/lib/cx';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { CharacterAvatar } from './CharacterAvatar';

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
 * Phone-only "whose data is this" cue: only Overview carries a portrait below
 * `md`, so an alt's Mail looked identical to the main's. Links to Characters
 * with this page as the return target (#1764). Absent on `/characters` itself
 * (it would link to where you already are) and with no active Character.
 */
function PhoneIdentityAvatar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const character = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  );
  if (!character || pathname === '/characters') return null;
  // `h-11 self-start` centres it on the title's first line even when the
  // actions beside it wrap to a second.
  return (
    <div className="flex h-11 shrink-0 items-center self-start md:hidden">
      <Link
        to="/characters"
        state={{ from: pathname }}
        aria-label={t('nav.switchCharacterNamed', { name: character.name })}
        className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:hidden"
      >
        <CharacterAvatar
          characterId={character.characterId}
          size="sm"
          loading="lazy"
          className="rounded-full"
        />
      </Link>
    </div>
  );
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
 * Below `md` the phone identity avatar is always the top-right corner, beside
 * the title. Title, meta and actions share one wrapping row to its left, so
 * actions stay inline when they fit and drop to a second line when they
 * don't — without taking the avatar (or the title) with them. At `md` that
 * row is `contents`, so every child is back in the header's own flex row.
 */
export function PageHeader({ title, meta, actions, subNav, className = '' }: PageHeaderProps) {
  // Some unit tests render a route's header without a router.
  const inRouter = useInRouterContext();
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
        {actions && (
          // `md:order-1`: after the sub-nav, which sits between meta and actions at `md`.
          <div
            className={cx(
              'ml-auto flex flex-wrap items-center justify-end gap-1.5 md:order-1',
              subNav ? 'md:pb-1' : undefined
            )}
          >
            {actions}
          </div>
        )}
      </div>
      {inRouter && <PhoneIdentityAvatar />}
      {subNav && (
        <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">{subNav}</div>
      )}
    </header>
  );
}
