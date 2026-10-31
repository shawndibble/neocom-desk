import { useNavBadges } from './navBadges';
import { useRailSettingsNeedsAttention, useSettingsNeedsAttention } from './settingsAttention';
import { RailUpgradeButton } from './RailUpgradeButton';
import { UnreadAlertsContext } from '@/components/ui/unreadAlertsContext';
import { memo, Suspense, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { pageKeyFor } from './pageTabs';
import { useRouteFocus } from './routeFocus';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePrefetch, isPrefetching } from '@/stores/prefetch';
import { isSyncConfigured } from './syncStatus';
import { SyncStatusDot } from './SyncStatusDot';
import { SyncErrorNote } from './SyncErrorNote';
import { OfflineBanner } from './OfflineBanner';
import { useSyncStatus } from './useSyncStatus';
import {
  CharacterAvatar,
  characterAvatarBoxClassName,
  LogoMark,
  Spinner,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { useFadeOnChange } from '@/lib/useFadeOnChange';
import { AlertCharacterSwitch } from './AlertCharacterSwitch';
import { CharacterSwitcher } from './CharacterSwitcher';
import { AuthFailureNotice } from './AuthFailureNotice';
import { StandingsScopeNotice } from './StandingsScopeNotice';
import { useLockedRoutes } from './useGrantedScopes';
import { ErrorBoundary } from './ErrorBoundary';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { GlobalPasteRouter } from './GlobalPasteRouter';
import { ForegroundNotificationPoller } from '@/features/notifications/ForegroundNotificationPoller';
import { NetWorthSnapshotRecorder } from '@/features/netWorth/NetWorthSnapshotRecorder';
import { AlertsPanelProvider } from '@/features/notifications/AlertsPanelContext';
import { useRequestBadgePoll } from '@/features/communities/requestBadge';
import { useAlertBadge } from '@/features/notifications/useUnreadAlertCount';
import { barTabs, NAV_LABEL_KEYS, useMobileTabs } from '@/lib/mobileTabs';
import { CorpGrantPrompt } from '@/features/corp/CorpGrantPrompt';
import { MailQueueMount } from '@/features/corpTaxBook/MailQueueMount';
import { InstallPrompt } from './InstallPrompt';
import { CommandPaletteHost } from '@/features/commandPalette/CommandPaletteHost';
import { NAV_LOCK_PATHS } from './navDestinations';
import { FOOTER_PAGES, viewPathFor } from './navRail';
import { recordRecentNav } from './navPreferences';
import { MOBILE_NAV_ACTIVE, MOBILE_NAV_IDLE, MOBILE_NAV_ITEM, NavItem } from './NavItem';
import { RailNav } from './RailNav';
import { ROUTE_OUTLET_ID, SkipLink } from './SkipLink';
import { MobileMoreSheet, MORE_SHEET_ID } from './MobileMoreSheet';

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
    <Tooltip content={label}>
      <span
        role="status"
        aria-label={label}
        tabIndex={0}
        className={`inline-block size-2 shrink-0 motion-safe:animate-pulse rounded-full bg-accent ${focusRingClassName}`}
      />
    </Tooltip>
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

const CHARACTER_TRIGGER = cx(
  'flex w-full items-center gap-2 p-2 text-left',
  rowInteractiveClassName,
  focusRingInsetClassName
);

/**
 * The active Character, as a plain link to `/characters` — the one dedicated
 * portrait+name entry point (a bar tab can also reach the route, but not this
 * portrait), rather than a menu onto Characters *and* Settings, which is now
 * its own ordinary `NavItem` just above this. The name is the accessible name
 * (`characterTriggerLabel`) once known, so a real link, not a button.
 */
function CharacterFooterLink({
  activeCharacter,
  size,
  className = '',
  onClick,
  originPath,
}: {
  activeCharacter: ActiveCharacter | undefined;
  size?: 'sm';
  className?: string;
  onClick?: () => void;
  /** The page to return to once a Character is picked (#1764). */
  originPath?: string;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to="/characters"
      state={originPath ? { from: originPath } : undefined}
      onClick={onClick}
      aria-label={characterTriggerLabel(activeCharacter, t)}
      className={`${CHARACTER_TRIGGER} ${className}`}
    >
      <CharacterTriggerFace activeCharacter={activeCharacter} size={size} />
    </Link>
  );
}

/**
 * The rail's `CharacterFooterLink`, carrying the current page (path and
 * query) as its origin (#4691). Its own component because it reads the
 * location, which `Layout` must not.
 */
function RailCharacterFooterLink({
  activeCharacter,
}: {
  activeCharacter: ActiveCharacter | undefined;
}) {
  const { pathname, search } = useLocation();
  return <CharacterFooterLink activeCharacter={activeCharacter} originPath={pathname + search} />;
}

/**
 * Records each view visited for the More sheet's Recent row. Renders nothing;
 * its own component because it reads the location, which `Layout` must not.
 */
function RecentNavRecorder() {
  const { pathname } = useLocation();
  const viewPath = viewPathFor(pathname);
  useEffect(() => {
    if (viewPath !== null) void recordRecentNav(viewPath);
  }, [viewPath]);
  return null;
}

/**
 * The global shortcut listener, as a component that renders nothing: its
 * `useNavigate` subscribes to the location, which `Layout` itself must not.
 */
function KeyboardShortcuts() {
  useKeyboardShortcuts();
  return null;
}

/**
 * The route outlet and everything keyed off the current location: the page
 * fade, route focus, and the boundary that clears on navigation.
 *
 * Its own component so that `Layout` never reads the location. Pages write
 * their filters and sort into the query string as the pilot types, and each
 * of those writes is a new location; were `Layout` subscribed, every one would
 * re-render the whole shell — rail, tab bar, their live queries — for a change
 * only the page cares about. The nav links still track the route: `NavLink`
 * reads the location itself.
 */
function RouteOutlet() {
  const { t } = useTranslation();
  const location = useLocation();
  const outletRef = useRef<HTMLDivElement>(null);
  // `pageKeyFor` collapses a tab segment (`/contacts/across`) to its page: a
  // tab switch is not a page change and does not fade the outlet (ADR 0015);
  // the tab panel fades on its own (`useTabPanelProps`).
  useFadeOnChange(outletRef, pageKeyFor(location.pathname));
  useRouteFocus(outletRef, location.pathname, location.hash);
  return (
    /*
      Deliberately not `key={location.pathname}`, which would replay a CSS
      animation by remounting. Six entries in App.tsx's `ROUTE_ELEMENTS`
      match more than one pathname (`/corp/assets/*`, the tabbed pages'
      `<path>/*` splats, and the four `:param` routes), and React Router keeps one component instance
      across those — so re-keying would throw away Assets' search, filters
      and selection on every drill-down and re-run its loader. Animating
      the element in place keeps the instance and still replays.
      `tabIndex={-1}`: where a page never renders an `<h1>`, route focus
      (`routeFocus.ts`) lands here instead.
    */
    <div ref={outletRef} id={ROUTE_OUTLET_ID} tabIndex={-1} className="focus:outline-none">
      {/* Routes are code-split (`routeChunks.ts`): the shell stays put
          while a page's chunk loads on its first visit, and a page that
          throws — or whose chunk will not load — fails inside the shell,
          clearing once the pilot navigates elsewhere. */}
      <ErrorBoundary inline resetKey={location.pathname}>
        <Suspense fallback={<Spinner block="page" label={t('common.loading')} />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

/**
 * App chrome: Neocom-style left rail on desktop, bottom tab bar on mobile.
 *
 * Reads no location (`RouteOutlet`), and memoized: it takes no props, so the
 * re-render its parent (`SignedInShell` in App.tsx, which does read the
 * location) gets on every query-string write stops here.
 */
export const Layout = memo(function Layout() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const activeCharacter = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  );

  const locked = useLockedRoutes(NAV_LOCK_PATHS);

  const [moreOpen, setMoreOpen] = useState(false);
  // Read once, not per rendering: the header bell (via context), the tab bar and
  // the sheet are all mounted on every route, so a hook inside each would open
  // several Dexie live queries over the same feed.
  const alertBadge = useAlertBadge();
  // New Requests on the Communities item, read while the app is open (issue #3810).
  useRequestBadgePoll();
  const navBadge = useNavBadges();
  const settingsAttention = useSettingsNeedsAttention();
  const railSettingsAttention = useRailSettingsNeedsAttention();
  const tabs = barTabs(useMobileTabs((state) => state.value));
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  // The More sheet is mounted conditionally (`!isDesktop &&` below), not
  // CSS-hidden: `showModal()` makes the page inert regardless of the dialog's
  // own `display`, so growing past `md` while open left an invisible modal
  // holding the whole app hostage. Unmounting instead lets `Modal`'s cleanup
  // close it and restore focus; `moreOpen` resets so a resize back to mobile
  // doesn't reopen it unasked.
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the sheet when the viewport grows past `md`
    if (isDesktop) setMoreOpen(false);
  }, [isDesktop]);

  return (
    <UnreadAlertsContext.Provider value={alertBadge}>
      <AlertsPanelProvider>
        <div className="flex min-h-screen bg-bg text-text">
          {/* Only where the rail shows: below `md` there is nothing to skip. */}
          {isDesktop && <SkipLink />}
          {/* Desktop left rail */}
          {/* z-30: above anything in the page (a column sliding out from behind it, like
              Improve's), below the overlays (z-40 and up). */}
          <aside className="sticky top-0 z-30 hidden h-screen w-52 flex-col border-r border-line bg-panel/85 backdrop-blur-sm md:flex">
            <div className="flex items-center gap-2 border-b border-line px-3 py-3">
              {/* Logo and wordmark navigate together, as one unit: a site name
              that goes home beside an inert logo is the odd half-measure.
              The two status indicators stay outside the link — a sync dot
              that navigates is nobody's expectation. */}
              <Link
                to="/overview"
                className={cx(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-xs text-text hover:text-accent',
                  interactiveClassName,
                  focusRingClassName
                )}
              >
                <LogoMark className="size-7 shrink-0" />
                <span className="min-w-0 truncate text-xs font-semibold tracking-widest uppercase">
                  {t('app.name')}
                </span>
              </Link>
              <PrefetchIndicator />
              {isSyncConfigured() && <SyncStatusIndicator />}
            </div>
            {/* The pages scroll (`RailNav`'s `overflow-y-auto`), which is what keeps
            the footer below pinned: the rail is `h-screen`, so a tall list
            (large text scale) would otherwise push it off the bottom. */}
            <RailNav />
            {/* Footer: Help, Settings, then Character (very bottom). `border-t`: at short
            heights the scrolling nav's last row is cut by this edge; the rule makes
            that read as scroll, not overlap. */}
            <div className="flex shrink-0 flex-col gap-0.5 border-t border-b border-line p-2">
              {FOOTER_PAGES.map((page) =>
                page.path === '/settings' ? (
                  <div key={page.path} className="flex items-center gap-1">
                    <NavItem
                      to={page.path}
                      label={t(page.labelKey)}
                      locked={false}
                      attention={railSettingsAttention}
                      className="flex-1"
                    />
                    <RailUpgradeButton />
                  </div>
                ) : (
                  <NavItem key={page.path} to={page.path} label={t(page.labelKey)} locked={false} />
                )
              )}
            </div>
            <div className="flex shrink-0 items-center pr-2">
              <div className="min-w-0 flex-1">
                <RailCharacterFooterLink activeCharacter={activeCharacter} />
              </div>
              <CharacterSwitcher />
            </div>
          </aside>

          <main className="min-w-0 flex-1 px-2 py-4 pb-[max(calc(5rem_+_env(safe-area-inset-bottom)),var(--compare-drawer-space,0px),calc(var(--sticky-clearance)_+_var(--bottom-nav-clearance)_+_1rem))] md:px-4 md:pb-[max(1rem,var(--compare-drawer-space,0px),calc(var(--sticky-clearance)_+_1rem))]">
            {/* Corp Tax Book send queue (D16): only while mail is queued. */}
            <MailQueueMount />
            <OfflineBanner />
            <AlertCharacterSwitch />
            <AuthFailureNotice />
            <StandingsScopeNotice />
            <SyncErrorBanner />
            <RouteOutlet />
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
                presentation="tab"
                {...navBadge(path)}
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
              // Settings lives in the sheet, so its dot rides here too (§6c).
              aria-label={
                settingsAttention ? t('nav.needsAttention', { label: t('nav.more') }) : undefined
              }
            >
              <Icon.NavMore aria-hidden="true" size={Icon.ICON_SIZE.md} />
              <span className="truncate">{t('nav.more')}</span>
              {settingsAttention && (
                <span
                  aria-hidden="true"
                  data-attention-dot
                  className="absolute top-1.5 left-1/2 ml-3 size-1.5 rounded-full bg-accent"
                />
              )}
            </button>
          </nav>

          <KeyboardShortcuts />
          <GlobalPasteRouter />
          <CommandPaletteHost />
          {/*
        In the shell rather than in `App`, unlike the reload prompt: it is
        about the *active Character*, so it belongs inside
        `RequireCharacter`, where there is always one.
      */}
          <CorpGrantPrompt />
          <InstallPrompt />
          <ForegroundNotificationPoller />
          <NetWorthSnapshotRecorder />

          <RecentNavRecorder />

          {!isDesktop && (
            <MobileMoreSheet
              open={moreOpen}
              onClose={() => setMoreOpen(false)}
              locked={locked}
              renderCharacterLink={(originPath) => (
                <div className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <CharacterFooterLink
                      activeCharacter={activeCharacter}
                      size="sm"
                      className="min-h-9 rounded-xs"
                      onClick={() => setMoreOpen(false)}
                      originPath={originPath}
                    />
                  </div>
                  <CharacterSwitcher onNavigate={() => setMoreOpen(false)} />
                </div>
              )}
            />
          )}
        </div>
      </AlertsPanelProvider>
    </UnreadAlertsContext.Provider>
  );
});
