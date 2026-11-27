import { useNavBadges } from './navBadges';
import { useRailSettingsNeedsAttention, useSettingsNeedsAttention } from './settingsAttention';
import { RailUpgradeButton } from './RailUpgradeButton';
import { UnreadAlertsContext } from '@/components/ui/unreadAlertsContext';
import { memo, Suspense, useEffect, useRef, useState, type ComponentProps } from 'react';
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
import { ShellStatusStrip } from './ShellStatusStrip';
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
import { FinishSetupHost } from '@/features/character/finishSetup/FinishSetupHost';
import { NetWorthSnapshotRecorder } from '@/features/netWorth/NetWorthSnapshotRecorder';
import { AlertsPanelProvider } from '@/features/notifications/AlertsPanelContext';
import { useRequestBadgePoll } from '@/features/communities/requestBadge';
import { useMoonsAttentionPoll } from '@/features/corp/moons/moonsNavAttention';
import { useAlertBadge } from '@/features/notifications/useUnreadAlertCount';
import { barTabs, NAV_LABEL_KEYS, useMobileTabs } from '@/lib/mobileTabs';
import { CorpGrantPrompt } from '@/features/corp/CorpGrantPrompt';
import { PageHeaderSlotProvider } from '@/components/ui/PageHeaderSlotProvider';
import { MailQueueMount } from '@/features/corpTaxBook/MailQueueMount';
import { InstallPrompt } from './InstallPrompt';
import { CommandPaletteHost } from '@/features/commandPalette/CommandPaletteHost';
import { NAV_LOCK_PATHS } from './navDestinations';
import { FOOTER_PAGES, navPlaceFor, viewPathFor } from './navRail';
import { recordRecentNav } from './navPreferences';
import { MOBILE_NAV_ACTIVE, MOBILE_NAV_IDLE, MOBILE_NAV_ITEM, NavItem } from './NavItem';
import { RailNav } from './RailNav';
import { ROUTE_OUTLET_ID, SkipLink } from './SkipLink';
import { MobileMoreSheet, MORE_SHEET_ID } from './MobileMoreSheet';

function SyncStatusIndicator() {
  const { status, online } = useSyncStatus();
  return <SyncStatusDot status={status} online={online} />;
}

function SyncErrorBanner() {
  const { status, online } = useSyncStatus();
  return <SyncErrorNote status={status} online={online} />;
}

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

function CharacterTriggerFace({
  activeCharacter,
  size,
}: {
  activeCharacter: ActiveCharacter | undefined;
  size?: 'sm';
}) {
  if (!activeCharacter) {
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

function RailCharacterFooterLink({
  activeCharacter,
}: {
  activeCharacter: ActiveCharacter | undefined;
}) {
  const { pathname, search } = useLocation();
  return <CharacterFooterLink activeCharacter={activeCharacter} originPath={pathname + search} />;
}

function MoreTab({
  tabs,
  open,
  ...props
}: { tabs: readonly string[]; open: boolean } & ComponentProps<'button'>) {
  const { pagePath } = navPlaceFor(useLocation().pathname);
  const offBar = pagePath !== null && !tabs.includes(pagePath);
  return (
    <button
      type="button"
      {...props}
      className={`${MOBILE_NAV_ITEM} ${open || offBar ? MOBILE_NAV_ACTIVE : MOBILE_NAV_IDLE}`}
    />
  );
}

function RecentNavRecorder() {
  const { pathname } = useLocation();
  const viewPath = viewPathFor(pathname);
  useEffect(() => {
    if (viewPath !== null) void recordRecentNav(viewPath);
  }, [viewPath]);
  return null;
}

function KeyboardShortcuts() {
  useKeyboardShortcuts();
  return null;
}

function RouteOutlet() {
  const { t } = useTranslation();
  const location = useLocation();
  const outletRef = useRef<HTMLDivElement>(null);
  useFadeOnChange(outletRef, pageKeyFor(location.pathname));
  useRouteFocus(outletRef, location.pathname, location.hash);
  return (
    <div ref={outletRef} id={ROUTE_OUTLET_ID} tabIndex={-1} className="focus:outline-none">
      <ErrorBoundary inline resetKey={location.pathname}>
        <Suspense fallback={<Spinner block="page" label={t('common.loading')} />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

export const Layout = memo(function Layout() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const activeCharacter = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  );

  const locked = useLockedRoutes(NAV_LOCK_PATHS);

  const [moreOpen, setMoreOpen] = useState(false);
  const alertBadge = useAlertBadge();
  useRequestBadgePoll();
  useMoonsAttentionPoll();
  const navBadge = useNavBadges();
  const settingsAttention = useSettingsNeedsAttention();
  const railSettingsAttention = useRailSettingsNeedsAttention();
  const tabs = barTabs(useMobileTabs((state) => state.value));
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const isDesktop = useMediaQuery(MD_UP_QUERY);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the sheet when the viewport grows past `md`
    if (isDesktop) setMoreOpen(false);
  }, [isDesktop]);

  return (
    <UnreadAlertsContext.Provider value={alertBadge}>
      <AlertsPanelProvider>
        <div className="flex min-h-dvh bg-bg text-text">
          {isDesktop && <SkipLink />}
          <aside className="sticky top-0 z-30 hidden h-screen w-52 flex-col border-r border-line bg-panel/85 backdrop-blur-sm md:flex">
            <div className="flex items-center gap-2 border-b border-line px-3 py-3">
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
            <RailNav />
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
                    {isDesktop && <RailUpgradeButton />}
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
            <PageHeaderSlotProvider>
              <MailQueueMount />
              <OfflineBanner />
              <AlertCharacterSwitch />
              <StandingsScopeNotice />
              <ShellStatusStrip>
                <AuthFailureNotice />
                <SyncErrorBanner />
              </ShellStatusStrip>
              <RouteOutlet />
            </PageHeaderSlotProvider>
          </main>

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
            <MoreTab
              tabs={tabs}
              open={moreOpen}
              ref={moreButtonRef}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-controls={MORE_SHEET_ID}
              onClick={() => setMoreOpen((open) => !open)}
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
            </MoreTab>
          </nav>

          <KeyboardShortcuts />
          <GlobalPasteRouter />
          <CommandPaletteHost />
          <CorpGrantPrompt />
          <InstallPrompt />
          <ForegroundNotificationPoller />
          <FinishSetupHost />
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
