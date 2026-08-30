import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isSyncConfigured } from './syncStatus';
import { SyncStatusDot } from './SyncStatusDot';
import { useSyncStatus } from './useSyncStatus';
import { CharacterAvatar, Modal } from '@/components/ui';
import { AuthFailureNotice } from './AuthFailureNotice';
import { useLockedRoutes } from './useGrantedScopes';
import type { AppRoutePath } from './routeScopes';

/**
 * Hidden entirely when Firebase isn't configured, rather than shown permanently
 * idle — a dot with nothing behind it just begs "why isn't this working".
 */
function SyncStatusIndicator() {
  const { status, online } = useSyncStatus();
  return <SyncStatusDot status={status} online={online} />;
}

const NAV_LINK =
  'flex items-center gap-2 rounded-xs border border-transparent px-3 py-2 text-xs font-semibold tracking-widest uppercase transition-colors';
const NAV_ACTIVE = 'border-line-bright bg-panel-2 text-accent';
const NAV_IDLE = 'text-text-dim hover:bg-panel-2 hover:text-text';

function navClass({ isActive }: { isActive: boolean }): string {
  return `${NAV_LINK} ${isActive ? NAV_ACTIVE : NAV_IDLE}`;
}

/** Nav-reachable routes, so `useLockedRoutes` answers for all of them at once. */
const NAV_PATHS = [
  '/characters',
  '/overview',
  '/skills',
  '/industry',
  '/market',
  '/wallet',
  '/assets',
  '/mail',
  '/calendar',
  '/contracts',
  '/orders',
] as const satisfies readonly AppRoutePath[];

interface NavItemProps {
  to: AppRoutePath;
  label: string;
  locked: boolean;
  onClick?: () => void;
}

/**
 * Nav link marking a destination the active Character cannot currently use.
 * Informational only — the link still navigates and the route's `ScopeGate`
 * explains why; disabling it would leave no way to reach the explanation.
 */
function NavItem({ to, label, locked, onClick }: NavItemProps) {
  const { t } = useTranslation();
  // The marker rides on `title`, not extra text: a second string inside the
  // link would rewrite its accessible name from "Assets" to "Assets, needs a
  // new login", which is not what the link is called.
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={navClass}
      title={locked ? t('reauth.navLocked') : undefined}
    >
      <span className="min-w-0 truncate">{label}</span>
      {locked && (
        <span aria-hidden="true" className="ml-auto size-1.5 shrink-0 rounded-full bg-warning" />
      )}
    </NavLink>
  );
}

const MORE_SHEET_ID = 'mobile-more-sheet';

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  activeCharacter: { characterId: number; name: string } | undefined;
  locked: ReadonlySet<AppRoutePath>;
}

/**
 * Mobile-only overflow sheet: the Character-section views that don't fit as
 * primary bottom-tab items, plus "switch character", plus Market (which isn't
 * Character-scoped, but the tab bar is full at 4 + More). A real modal, not a
 * drawer: it covers the viewport, so the tab bar underneath must not stay
 * reachable — hence the shared `Modal` and its dismissal contract. Links close
 * it on click so it never hangs over the next route.
 */
function MobileMoreSheet({ open, onClose, activeCharacter, locked }: MobileMoreSheetProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} id={MORE_SHEET_ID} onClose={onClose} title={t('nav.more')} placement="sheet">
      <div className="space-y-1 pb-3">
        <NavItem
          to="/market"
          label={t('nav.market')}
          locked={locked.has('/market')}
          onClick={onClose}
        />
        {activeCharacter && (
          <Link
            to="/characters"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xs border border-transparent px-3 py-2 transition-colors hover:bg-panel-2"
          >
            <CharacterAvatar characterId={activeCharacter.characterId} size="sm" />
            <span className="min-w-0 truncate text-xs">{activeCharacter.name}</span>
          </Link>
        )}
        <NavItem
          to="/wallet"
          label={t('nav.wallet')}
          locked={locked.has('/wallet')}
          onClick={onClose}
        />
        <NavItem
          to="/assets"
          label={t('nav.assets')}
          locked={locked.has('/assets')}
          onClick={onClose}
        />
        <NavItem to="/mail" label={t('nav.mail')} locked={locked.has('/mail')} onClick={onClose} />
        <NavItem
          to="/calendar"
          label={t('nav.calendar')}
          locked={locked.has('/calendar')}
          onClick={onClose}
        />
        <NavItem
          to="/contracts"
          label={t('nav.contracts')}
          locked={locked.has('/contracts')}
          onClick={onClose}
        />
        <NavItem
          to="/orders"
          label={t('nav.orders')}
          locked={locked.has('/orders')}
          onClick={onClose}
        />
      </div>
    </Modal>
  );
}

/** App chrome: Neocom-style left rail on desktop, bottom tab bar on mobile. */
export function Layout() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const activeCharacter = useLiveQuery(
    () => (activeCharacterId === null ? undefined : db.characters.get(activeCharacterId)),
    [activeCharacterId]
  );

  const locked = useLockedRoutes(NAV_PATHS);

  const [moreOpen, setMoreOpen] = useState(false);
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
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-xs bg-accent text-sm font-bold text-accent-contrast"
          >
            N
          </span>
          <span className="flex-1 text-xs font-semibold tracking-widest uppercase">
            {t('app.name')}
          </span>
          {isSyncConfigured() && <SyncStatusIndicator />}
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          <NavItem
            to="/characters"
            label={t('nav.characters')}
            locked={locked.has('/characters')}
          />
          <NavItem to="/overview" label={t('nav.overview')} locked={locked.has('/overview')} />
          <NavItem to="/skills" label={t('nav.skills')} locked={locked.has('/skills')} />
          <NavItem to="/industry" label={t('nav.industry')} locked={locked.has('/industry')} />
          <NavItem to="/market" label={t('nav.market')} locked={locked.has('/market')} />
          <p className="mt-3 px-3 text-[0.625rem] font-semibold tracking-widest text-text-faint uppercase">
            {t('nav.characterSection')}
          </p>
          <NavItem to="/wallet" label={t('nav.wallet')} locked={locked.has('/wallet')} />
          <NavItem to="/assets" label={t('nav.assets')} locked={locked.has('/assets')} />
          <NavItem to="/mail" label={t('nav.mail')} locked={locked.has('/mail')} />
          <NavItem to="/calendar" label={t('nav.calendar')} locked={locked.has('/calendar')} />
          <NavItem to="/contracts" label={t('nav.contracts')} locked={locked.has('/contracts')} />
          <NavItem to="/orders" label={t('nav.orders')} locked={locked.has('/orders')} />
        </nav>
        {activeCharacter && (
          <Link
            to="/characters"
            aria-label={t('nav.switchCharacter')}
            className="flex items-center gap-2 border-t border-line p-2 transition-colors hover:bg-panel-2"
          >
            <CharacterAvatar characterId={activeCharacter.characterId} />
            <span className="min-w-0 truncate text-xs">{activeCharacter.name}</span>
          </Link>
        )}
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-20 md:pb-4">
        <AuthFailureNotice />
        <Outlet />
      </main>

      {/* Mobile bottom tab bar: 4 primary destinations + More. */}
      <nav
        aria-label={t('nav.mobileLabel')}
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line bg-panel/95 backdrop-blur-sm md:hidden"
      >
        <NavLink to="/characters" className={navClass}>
          {t('nav.characters')}
        </NavLink>
        <NavLink to="/overview" className={navClass}>
          {t('nav.overview')}
        </NavLink>
        <NavLink to="/skills" className={navClass}>
          {t('nav.skills')}
        </NavLink>
        <NavLink to="/industry" className={navClass}>
          {t('nav.industry')}
        </NavLink>
        <button
          type="button"
          ref={moreButtonRef}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-controls={MORE_SHEET_ID}
          onClick={() => setMoreOpen((open) => !open)}
          className={`${NAV_LINK} ${moreOpen ? NAV_ACTIVE : NAV_IDLE}`}
        >
          {t('nav.more')}
        </button>
      </nav>

      {!isDesktop && (
        <MobileMoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          activeCharacter={activeCharacter}
          locked={locked}
        />
      )}
    </div>
  );
}
