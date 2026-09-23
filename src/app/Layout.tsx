import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { pageKeyFor } from './pageTabs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePrefetch, isPrefetching } from '@/stores/prefetch';
import { isSyncConfigured } from './syncStatus';
import { SyncStatusDot } from './SyncStatusDot';
import { SyncErrorNote } from './SyncErrorNote';
import { useSyncStatus } from './useSyncStatus';
import { CharacterAvatar, characterAvatarBoxClassName, LogoMark, Modal } from '@/components/ui';
import { AuthFailureNotice } from './AuthFailureNotice';
import { useGrantedScopes, useLockedRoutes } from './useGrantedScopes';
import { warmRoute } from './routeWarm';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { NotificationPermissionPrompt } from '@/features/notifications/NotificationPermissionPrompt';
import { ForegroundNotificationPoller } from '@/features/notifications/ForegroundNotificationPoller';
import { useUnreadAlertCount } from '@/features/notifications/useUnreadAlertCount';
import {
  barTabs,
  mobileSheetPaths,
  NAV_LABEL_KEYS,
  useMobileTabs,
  type MobileTabPath,
} from '@/lib/mobileTabs';
import { CorpGrantPrompt } from '@/features/corp/CorpGrantPrompt';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useActiveCorporationId } from '@/features/corp/owner';
import type { AppRoutePath } from './routeScopes';

/**
 * Hidden entirely when Firebase isn't configured, rather than shown permanently
 * idle — a dot with nothing behind it just begs "why isn't this working".
 */
function SyncStatusIndicator() {
  const { status, online } = useSyncStatus();
  return <SyncStatusDot status={status} online={online} />;
}

/**
 * The visible half of the sync signal, shell-wide (#1132). `SyncStatusDot`
 * carries its state in a `title=`/`aria-label` only and lives inside the
 * desktop-only rail, so below `md` a failing sync said nothing at all except
 * on `/skills/plans`, the one route that mounted this note for itself.
 *
 * Mounted at every width, not `md:hidden`: that route rendered the note on
 * desktop too, and hiding it above `md` would take away a signal desktop
 * already has. A desktop user seeing both this and the rail's red dot is the
 * intended overlap.
 *
 * No `isSyncConfigured()` gate, unlike the dot: `SyncErrorNote` renders
 * nothing outside the `error` state, and only `sync/planSync.ts` writes that
 * state — which never runs when sync isn't configured.
 *
 * Its own component, like `SyncStatusIndicator`, so a status tick re-renders
 * the note rather than the whole shell.
 */
function SyncErrorBanner() {
  const { status, online } = useSyncStatus();
  return <SyncErrorNote status={status} online={online} />;
}

/**
 * Present only while the boot warm-up (`app/prefetch.ts`) has work outstanding.
 * Unlike the sync dot it has no resting state: a permanently-idle second dot
 * beside the first says nothing, and warming is over in seconds.
 */
function PrefetchIndicator() {
  const { t } = useTranslation();
  const running = usePrefetch(isPrefetching);
  if (!running) return null;
  const label = t('prefetch.running');
  return (
    <span
      role="status"
      title={label}
      aria-label={label}
      className="inline-block size-2 shrink-0 animate-pulse rounded-full bg-accent"
    />
  );
}

// `min-h-11 md:min-h-0`: this class is shared by the desktop rail (`hidden
// md:flex`, mouse-operated, room to spare) and the mobile-only More sheet
// (`MobileMoreSheet`, reached only through the `md:hidden` bottom tab bar).
// Unqualified, both got the rail's compact ~34px row — fine for a pointer,
// too short for adjacent full-width rows a thumb taps in a scrolling sheet.
// The `md:` qualifier means only the phone-only rendering ever sees `min-h-11`.
const NAV_LINK =
  'flex min-h-11 items-center gap-2 rounded-xs border border-transparent px-3 py-2 text-xs font-semibold tracking-widest uppercase transition-colors md:min-h-0';
const NAV_ACTIVE = 'border-line-bright bg-panel-2 text-accent';
const NAV_IDLE = 'text-text-dim hover:bg-panel-2 hover:text-text';

function navClass({ isActive }: { isActive: boolean }): string {
  return `${NAV_LINK} ${isActive ? NAV_ACTIVE : NAV_IDLE}`;
}

// Distinct from NAV_LINK (used by the desktop rail and the More sheet, both
// of which scroll and have room to spare): the bottom tab bar is a fixed
// four-way split of a viewport that can be as narrow as ~320px. `flex-1
// min-w-0` forces every tab — including "More" — to always get an equal,
// bounded share of the width, so a long label truncates instead of pushing
// later tabs off-screen. `min-h-11` (44px) meets the mobile touch-target
// minimum regardless of how little padding the text needs.
const MOBILE_NAV_ITEM =
  'flex min-h-11 min-w-0 flex-1 items-center justify-center border-t-2 border-transparent px-1 py-2 text-[0.625rem] font-semibold uppercase transition-colors';
const MOBILE_NAV_ACTIVE = 'border-accent bg-panel-2 text-accent';
const MOBILE_NAV_IDLE = 'text-text-dim hover:bg-panel-2 hover:text-text';

function mobileNavClass({ isActive }: { isActive: boolean }): string {
  return `${MOBILE_NAV_ITEM} ${isActive ? MOBILE_NAV_ACTIVE : MOBILE_NAV_IDLE}`;
}

/**
 * Routes the shell itself renders a lock marker for, so `useLockedRoutes`
 * answers for all of them at once. `/clones` and `/employment-history` left
 * with the rail — they are Overview tabs now and `OverviewSubNav` asks for
 * their state itself. `/characters` and `/settings` are UNGATED
 * (routeScopes.ts), so the footer's Settings item and `CharacterFooterLink`
 * have no marker to render.
 *
 * `/corp` is deliberately absent: this list is what draws the amber lock dot,
 * and corp UI hides rather than locks (CONTEXT.md round 35). Its entry is
 * rendered conditionally on `useCorpAccess()` instead — see `CorpNavItem`.
 */
const NAV_PATHS = [
  '/overview',
  '/alerts',
  '/skills',
  '/industry',
  '/mining',
  '/planetary-industry',
  '/market',
  '/wallet',
  '/assets',
  '/mail',
  '/calendar',
  '/contracts',
  '/contacts',
] as const satisfies readonly AppRoutePath[];

interface NavItemProps {
  to: AppRoutePath;
  label: string;
  locked: boolean;
  /**
   * What is waiting at this destination, rendered beside the label. Zero and
   * `undefined` both render nothing: a badge reading "0" is a badge you stop
   * looking at. It is a number, not a dot, because "some" and "seventy" are
   * different situations and an accent tint conveys neither (DESIGN.md §7) —
   * and it rides in the link's accessible name rather than as a bare numeral a
   * screen reader would read out as "Alerts 12".
   */
  badge?: number;
  /**
   * `rail` (default) is the desktop rail's full-width row, which the More
   * sheet also uses; `tab` is the phone tab bar's equal share of the viewport.
   * One component for both so the lock marker, the badge and the accessible
   * name cannot say different things in the two places a destination appears.
   */
  presentation?: 'rail' | 'tab';
  onClick?: () => void;
}

/**
 * A nav destination, wherever it appears.
 *
 * A `locked` one is marked, never disabled: the link still navigates and the
 * route's `ScopeGate` explains why, and disabling it would leave no way to
 * reach the explanation.
 */
function NavItem({ to, label, locked, badge, presentation = 'rail', onClick }: NavItemProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const granted = useGrantedScopes();
  /*
   * Compose this route's snapshot while the pointer is still travelling to the
   * link (`routeWarm.ts`). `focus` covers the keyboard, where tabbing to a link
   * is the same declaration of intent. Both are fire-and-forget: `warmRoute`
   * never rejects, and it no-ops for a route that is already warm, already
   * warming, short of a grant, or simply has no warmer.
   *
   * The grant, not `locked`, is what gates it — an `UNGATED` route can still
   * compose scope-gated reads, so `routeWarm.ts` filters on the endpoints its
   * loader actually reaches.
   *
   * A touch device fires neither event until the tap itself, so on the phone's
   * two surfaces this is inert rather than wasted.
   */
  const warm = () => void warmRoute(to, activeCharacterId, granted);
  const tab = presentation === 'tab';
  const counted = badge !== undefined && badge > 0;
  // The lock marker rides on `title`, and the count on `aria-label`: a second
  // string inside the link would rewrite its accessible name from "Assets" to
  // "Assets, needs a new login", which is not what the link is called.
  return (
    <NavLink
      to={to}
      onClick={onClick}
      onMouseEnter={warm}
      onFocus={warm}
      className={tab ? mobileNavClass : navClass}
      title={locked ? t('reauth.navLocked') : undefined}
      aria-label={counted ? t('nav.alertsWithCount', { count: badge }) : undefined}
    >
      <span className="min-w-0 truncate">{label}</span>
      {counted && (
        <span
          aria-hidden="true"
          className={`shrink-0 rounded-xs bg-panel-2 tabular-nums text-text-dim ${
            tab ? 'ml-1 px-1' : 'ml-auto px-1.5 text-[0.6875rem] font-medium'
          }`}
        >
          {badge}
        </span>
      )}
      {locked && (
        <span
          aria-hidden="true"
          className={`size-1.5 shrink-0 rounded-full bg-warning ${tab ? 'ml-1' : 'ml-auto'}`}
        />
      )}
    </NavLink>
  );
}

/**
 * The Corp section's entry, present only for a Character whose Corp Access is
 * `ready` *and* whose corporation is known.
 *
 * Hidden, never locked, in every other case — including `unknown`, which
 * renders as `none` here on purpose: a nav item that flickers into existence
 * mid-load is worse than one that appears a beat late (CONTEXT.md round 35).
 * The route itself takes the opposite view of `unknown` and waits, so a
 * deep-linked Director is not bounced (`routes/Corp.tsx`).
 *
 * The corporation id is part of the gate rather than an extra, the same
 * composition `owner.ts` makes for the Personal / Corporation switch: it is
 * written by the public-info read, so on a cold device it is simply absent, and
 * an entry into a section with no corporation behind it is one that must not be
 * on screen yet. It is self-healing — the first visit to `/corp` learns and
 * records the id, and this is a `useLiveQuery`.
 *
 * `locked` is hard-wired false rather than read from `useLockedRoutes`: there
 * is no state in which this renders and is unusable, and the amber dot would
 * offer a re-login for a role only CCP can grant.
 */
function CorpNavItem({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation();
  const { state } = useCorpAccess();
  const corporationId = useActiveCorporationId();
  if (state !== 'ready' || corporationId === null) return null;
  return <NavItem to="/corp" label={t('nav.corp')} locked={false} onClick={onClick} />;
}

/** Small heading introducing a group of NavItems in the desktop rail. */
function NavGroupLabel({ children }: { children: string }) {
  return (
    <p className="mt-3 px-3 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
      {children}
    </p>
  );
}

interface ActiveCharacter {
  characterId: number;
  name: string;
}

/**
 * Content of `CharacterFooterLink`, shared by the rail and the sheet. It
 * renders through the gap where `activeCharacter` is still undefined — that
 * is just the Dexie lookup resolving on a cold load, and hiding it would
 * leave the Characters route, which appears nowhere else now, briefly
 * unreachable.
 *
 * Through that gap it holds the avatar's footprint so the layout doesn't
 * jump, and carries no text: the link's name comes from `aria-label` instead
 * (see `characterTriggerLabel`). A visible "Switch character" placeholder
 * would collide with the identically-worded shortcut description Settings
 * lists, which is a real ambiguity for a screen reader, not just for a test.
 */
function CharacterTriggerFace({
  activeCharacter,
  size,
}: {
  activeCharacter: ActiveCharacter | undefined;
  size?: 'sm';
}) {
  if (!activeCharacter) {
    // Borrows the portrait's own box so the placeholder doesn't change shape
    // when the real one arrives.
    return (
      <span
        aria-hidden="true"
        className={`${characterAvatarBoxClassName(size)} border-line bg-panel-2`}
      />
    );
  }
  return (
    <>
      <CharacterAvatar characterId={activeCharacter.characterId} size={size} />
      <span className="min-w-0 truncate text-xs">{activeCharacter.name}</span>
    </>
  );
}

/**
 * Undefined once the Character is known: the visible name is then the better
 * accessible name, and an `aria-label` over it would only replace what the
 * user can see with something vaguer.
 */
function characterTriggerLabel(
  activeCharacter: ActiveCharacter | undefined,
  t: (key: string) => string
): string | undefined {
  return activeCharacter ? undefined : t('nav.switchCharacter');
}

const CHARACTER_TRIGGER =
  'flex w-full items-center gap-2 p-2 text-left transition-colors hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

/**
 * The active Character, as a plain link to `/characters` — the only way to
 * switch or add a Character, rather than a menu opening onto Characters *and*
 * Settings. Settings is now its own ordinary nav item (`NavItem`) sitting
 * just above this on both surfaces, so the trigger no longer needs to carry
 * it. The name *is* the accessible name (`characterTriggerLabel`) once the
 * Character is known, so a real link — not a button — is both simpler and
 * gives middle-click/"open in new tab" for free.
 */
function CharacterFooterLink({
  activeCharacter,
  size,
  className = '',
  onClick,
}: {
  activeCharacter: ActiveCharacter | undefined;
  size?: 'sm';
  className?: string;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to="/characters"
      onClick={onClick}
      aria-label={characterTriggerLabel(activeCharacter, t)}
      className={`${CHARACTER_TRIGGER} ${className}`}
    >
      <CharacterTriggerFace activeCharacter={activeCharacter} size={size} />
    </Link>
  );
}

/** A plain rule, styled like the Radix menu separators elsewhere in the app (`DropdownMenuSeparator` et al.) but usable outside a menu. */
function FooterDivider() {
  return <div role="separator" aria-orientation="horizontal" className="my-1 h-px bg-line" />;
}

const MORE_SHEET_ID = 'mobile-more-sheet';

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  activeCharacter: ActiveCharacter | undefined;
  locked: ReadonlySet<AppRoutePath>;
  tabs: readonly MobileTabPath[];
  unreadAlerts: number;
}

/**
 * Mobile-only overflow sheet: `mobileSheetPaths(tabs)`, everything the bottom
 * tab bar does not hold, in the desktop rail's order.
 *
 * Three entries sit outside that rotation, because nothing may evict them:
 * Corp (hidden rather than locked, and this is the phone's only route to it),
 * and Settings plus the active Character below the divider — Settings has no
 * other route on a phone, and the Character link is the only way to switch or
 * add one. A real modal, not a drawer: it covers the viewport, so the tab bar
 * underneath must not stay reachable — hence the shared `Modal` and its
 * dismissal contract. Links close it on click so it never hangs over the next
 * route.
 */
function MobileMoreSheet({
  open,
  onClose,
  activeCharacter,
  locked,
  tabs,
  unreadAlerts,
}: MobileMoreSheetProps) {
  const { t } = useTranslation();
  const rows = mobileSheetPaths(tabs);

  return (
    <Modal open={open} id={MORE_SHEET_ID} onClose={onClose} title={t('nav.more')} placement="sheet">
      {/* `space-y-2`, not the tighter `space-y-1` a desktop-rail-shared gap
          would use: these rows are now full 44px touch targets, and 4px
          between two of them left almost no dead zone for a thumb to miss
          into on this phone-only sheet. */}
      <div className="space-y-2 pb-3">
        <CorpNavItem onClick={onClose} />
        {rows.map((path) => (
          <NavItem
            key={path}
            to={path}
            label={t(NAV_LABEL_KEYS[path])}
            locked={locked.has(path)}
            badge={path === '/alerts' ? unreadAlerts : undefined}
            onClick={onClose}
          />
        ))}
        <FooterDivider />
        <NavItem to="/settings" label={t('nav.settings')} locked={false} onClick={onClose} />
        <CharacterFooterLink
          activeCharacter={activeCharacter}
          size="sm"
          className="min-h-11 rounded-xs"
          onClick={onClose}
        />
      </div>
    </Modal>
  );
}

/**
 * Fades the route outlet in whenever the page changes — `pageKeyFor`'s
 * pathname, in which a tab segment (`/contacts/across`) collapses to its page:
 * a tab switch is not a page change and does not fade (ADR 0015).
 *
 * Runs the animation on the live element rather than replaying a CSS one,
 * because the only way to restart a CSS animation is to remount — and the
 * outlet must keep its instance (see the call site). `useLayoutEffect`, so the
 * first frame at the new route is already at opacity 0; an effect after paint
 * would flash the content in at full opacity and then fade it.
 *
 * The `animate` guard is a real capability check, not a test shim: jsdom
 * implements no Web Animations API, so this must degrade to an instant swap
 * exactly as it does in a browser that lacks it.
 */
function useRouteFade(pageKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const running = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || typeof node.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Navigating again mid-fade would otherwise leave two animations driving
    // the same property, and the abandoned one still holds its own opacity.
    running.current?.cancel();
    running.current = node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 140,
      easing: 'ease-out',
    });
  }, [pageKey]);

  return ref;
}

/** App chrome: Neocom-style left rail on desktop, bottom tab bar on mobile. */
export function Layout() {
  const { t } = useTranslation();
  useKeyboardShortcuts();
  const location = useLocation();
  const outletRef = useRouteFade(pageKeyFor(location.pathname));
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const activeCharacter = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  );

  const locked = useLockedRoutes(NAV_PATHS);

  const [moreOpen, setMoreOpen] = useState(false);
  // Read once, not per rendering: the rail, the tab bar and the sheet are all
  // mounted on every route, so a hook inside the nav item would open three
  // Dexie live queries over the same feed.
  const unreadAlerts = useUnreadAlertCount();
  const tabs = barTabs(useMobileTabs((state) => state.value));
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  // The More sheet is mounted conditionally (`!isDesktop &&` below), not
  // CSS-hidden: `showModal()` makes the page inert regardless of the dialog's
  // own `display`, so growing past `md` while open left an invisible modal
  // holding the whole app hostage. Unmounting instead lets `Modal`'s cleanup
  // close it and restore focus; `moreOpen` resets so a resize back to mobile
  // doesn't reopen it unasked.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 48rem)').matches
  );
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 48rem)');
    const onChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (e.matches) setMoreOpen(false);
    };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="flex min-h-screen bg-bg text-text">
      {/* Desktop left rail */}
      <aside className="sticky top-0 hidden h-screen w-48 flex-col border-r border-line bg-panel/85 backdrop-blur-sm md:flex">
        <div className="flex items-center gap-2 border-b border-line px-3 py-3">
          {/* Logo and wordmark navigate together, as one unit: a site name
              that goes home beside an inert logo is the odd half-measure.
              The two status indicators stay outside the link — a sync dot
              that navigates is nobody's expectation. */}
          <Link
            to="/overview"
            className="flex min-w-0 flex-1 items-center gap-2 text-text transition-colors hover:text-accent"
          >
            <LogoMark className="size-7 shrink-0" />
            <span className="min-w-0 truncate text-xs font-semibold tracking-widest uppercase">
              {t('app.name')}
            </span>
          </Link>
          <PrefetchIndicator />
          {isSyncConfigured() && <SyncStatusIndicator />}
        </div>
        {/* `overflow-y-auto` is what makes the character menu below actually
            pinned: the rail is `h-screen`, so without it a tall list (large
            text scale) would push the footer off the bottom instead of
            scrolling. */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <NavItem
            to="/overview"
            label={t(NAV_LABEL_KEYS['/overview'])}
            locked={locked.has('/overview')}
          />
          {/*
            Under Overview, not in Social: an alert is what the board is
            summarising, and the two are read in that order. Mail and calendar
            are correspondence — things other people sent you on purpose —
            which is a different errand.
          */}
          <NavItem
            to="/alerts"
            label={t(NAV_LABEL_KEYS['/alerts'])}
            locked={locked.has('/alerts')}
            badge={unreadAlerts}
          />
          {/*
            Beside Overview rather than inside a group: the two are the same
            kind of destination — "this pilot" and "this corporation" — and the
            Corp section has sub-navigation of its own for the views that land
            under it (`CorpSubNav`). No group label, because a heading over a
            conditionally-rendered item would strand itself for the ~95% of
            users who never see the item.
          */}
          <CorpNavItem />
          <NavGroupLabel>{t('nav.groups.progression')}</NavGroupLabel>
          <NavItem
            to="/skills"
            label={t(NAV_LABEL_KEYS['/skills'])}
            locked={locked.has('/skills')}
          />
          <NavItem
            to="/industry"
            label={t(NAV_LABEL_KEYS['/industry'])}
            locked={locked.has('/industry')}
          />
          <NavItem
            to="/mining"
            label={t(NAV_LABEL_KEYS['/mining'])}
            locked={locked.has('/mining')}
          />
          <NavItem
            to="/planetary-industry"
            label={t(NAV_LABEL_KEYS['/planetary-industry'])}
            locked={locked.has('/planetary-industry')}
          />
          <NavGroupLabel>{t('nav.groups.economy')}</NavGroupLabel>
          {/* Leads the group: it is the one economy view that answers a
              question before you own anything, and the only one here that
              isn't Character-scoped. */}
          <NavItem
            to="/market"
            label={t(NAV_LABEL_KEYS['/market'])}
            locked={locked.has('/market')}
          />
          <NavItem
            to="/wallet"
            label={t(NAV_LABEL_KEYS['/wallet'])}
            locked={locked.has('/wallet')}
          />
          <NavItem
            to="/assets"
            label={t(NAV_LABEL_KEYS['/assets'])}
            locked={locked.has('/assets')}
          />
          <NavItem
            to="/contracts"
            label={t(NAV_LABEL_KEYS['/contracts'])}
            locked={locked.has('/contracts')}
          />
          <NavGroupLabel>{t('nav.groups.social')}</NavGroupLabel>
          <NavItem to="/mail" label={t(NAV_LABEL_KEYS['/mail'])} locked={locked.has('/mail')} />
          <NavItem
            to="/calendar"
            label={t(NAV_LABEL_KEYS['/calendar'])}
            locked={locked.has('/calendar')}
          />
          <NavItem
            to="/contacts"
            label={t(NAV_LABEL_KEYS['/contacts'])}
            locked={locked.has('/contacts')}
          />
        </nav>
        {/*
          Footer: Settings then the active Character, in that reading order —
          Settings sits just above the Character link, which is the very
          bottom of the rail. Its `border-b` rules off the bottom of Settings,
          separating it from the Character link below rather than from the
          scrollable nav above.
        */}
        <div className="shrink-0 border-b border-line p-2">
          <NavItem to="/settings" label={t('nav.settings')} locked={false} />
        </div>
        <CharacterFooterLink activeCharacter={activeCharacter} />
      </aside>

      <main className="min-w-0 flex-1 px-2 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-4 md:pb-4">
        <AuthFailureNotice />
        <SyncErrorBanner />
        {/*
          Deliberately not `key={location.pathname}`, which would replay a CSS
          animation by remounting. Six entries in App.tsx's `ROUTE_ELEMENTS`
          match more than one pathname (`/assets/*`, `/corp/assets/*`, and the
          four `:param` routes), and React Router keeps one component instance
          across those — so re-keying would throw away Assets' search, filters
          and selection on every drill-down and re-run its loader. Animating
          the element in place keeps the instance and still replays.
        */}
        <div ref={outletRef}>
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar: the pilot's four destinations (`lib/mobileTabs.ts`,
          set in Settings) + More. The count is fixed, which is what keeps
          MOBILE_NAV_ITEM's equal-share split honest.
          `env(safe-area-inset-bottom)` keeps the bar clear of the
          home-indicator gesture area on notched phones. */}
      <nav
        aria-label={t('nav.mobileLabel')}
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        {tabs.map((path) => (
          <NavItem
            key={path}
            to={path}
            label={t(NAV_LABEL_KEYS[path])}
            locked={locked.has(path)}
            badge={path === '/alerts' ? unreadAlerts : undefined}
            presentation="tab"
          />
        ))}
        <button
          type="button"
          ref={moreButtonRef}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-controls={MORE_SHEET_ID}
          onClick={() => setMoreOpen((open) => !open)}
          className={`${MOBILE_NAV_ITEM} ${moreOpen ? MOBILE_NAV_ACTIVE : MOBILE_NAV_IDLE}`}
        >
          <span className="truncate">{t('nav.more')}</span>
        </button>
      </nav>

      <NotificationPermissionPrompt />
      {/*
        In the shell rather than in `App`, unlike the install and reload
        prompts: it is about the *active Character*, so it belongs inside
        `RequireCharacter`, where there is always one.
      */}
      <CorpGrantPrompt />
      <ForegroundNotificationPoller />

      {!isDesktop && (
        <MobileMoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          activeCharacter={activeCharacter}
          locked={locked}
          tabs={tabs}
          unreadAlerts={unreadAlerts}
        />
      )}
    </div>
  );
}
