import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isSyncConfigured } from './syncStatus';
import { SyncStatusDot } from './SyncStatusDot';
import { useSyncStatus } from './useSyncStatus';
import {
  CharacterAvatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LogoMark,
  Modal,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { AuthFailureNotice } from './AuthFailureNotice';
import { useLockedRoutes } from './useGrantedScopes';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { NotificationPermissionPrompt } from '@/features/notifications/NotificationPermissionPrompt';
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
 * (routeScopes.ts), so the character menu has no marker to render.
 */
const NAV_PATHS = [
  '/overview',
  '/skills',
  '/industry',
  '/market',
  '/wallet',
  '/planetary-industry',
  '/assets',
  '/mail',
  '/calendar',
  '/contracts',
  '/contacts',
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
 * Trigger face shared by the rail menu and the sheet's disclosure. The control
 * renders through the gap where `activeCharacter` is still undefined — that is
 * just the Dexie lookup resolving on a cold load, and hiding it would leave
 * Characters and Settings, which appear nowhere else now, briefly unreachable.
 *
 * Through that gap it holds the avatar's footprint so the rail doesn't jump,
 * and carries no text: the trigger's name comes from `aria-label` instead
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
    return (
      <span
        aria-hidden="true"
        className={`${size === 'sm' ? 'size-7' : 'size-8'} shrink-0 rounded-full bg-panel-2`}
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
 * Desktop rail footer: the active Character, opening onto the two views that
 * used to sit in the rail proper. The name *is* the accessible name — Radix
 * adds `aria-haspopup="menu"`, so an extra label would only rewrite it into
 * something less useful than the pilot's own name. Items are `asChild` links
 * so they stay real anchors (middle-click, "open in new tab").
 */
function RailCharacterMenu({ activeCharacter }: { activeCharacter: ActiveCharacter | undefined }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={characterTriggerLabel(activeCharacter, t)}
        className={`${CHARACTER_TRIGGER} shrink-0 border-t border-line`}
      >
        <CharacterTriggerFace activeCharacter={activeCharacter} />
      </DropdownMenuTrigger>
      {/* Anchored upward: the trigger is pinned to the bottom of the viewport. */}
      <DropdownMenuContent side="top" align="start" className="w-44">
        <DropdownMenuItem asChild>
          <Link to="/characters">{t('nav.characters')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">{t('nav.settings')}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The sheet's equivalent of `RailCharacterMenu`, as an inline disclosure
 * rather than a `DropdownMenu`: `DropdownMenuContent` portals to `document.body`,
 * which sits *outside* the top-layer `<dialog>` the sheet opens with
 * `showModal()` — and everything outside it is inert, so the menu would render
 * and then refuse every click. `Modal` mounts its children only while open, so
 * the expanded state resets with the sheet and never reopens pre-expanded.
 */
function SheetCharacterMenu({
  activeCharacter,
  onNavigate,
}: {
  activeCharacter: ActiveCharacter | undefined;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={characterTriggerLabel(activeCharacter, t)}
        onClick={() => setExpanded((open) => !open)}
        className={`${CHARACTER_TRIGGER} min-h-11 rounded-xs`}
      >
        <CharacterTriggerFace activeCharacter={activeCharacter} size="sm" />
        <span aria-hidden="true" className="ml-auto shrink-0 text-text-faint">
          {expanded ? <Icon.Expanded /> : <Icon.Descend />}
        </span>
      </button>
      {expanded && (
        <div className="ml-3 space-y-1 border-l border-line pl-2">
          <NavItem
            to="/characters"
            label={t('nav.characters')}
            locked={false}
            onClick={onNavigate}
          />
          <NavItem to="/settings" label={t('nav.settings')} locked={false} onClick={onNavigate} />
        </div>
      )}
    </div>
  );
}

const MORE_SHEET_ID = 'mobile-more-sheet';

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  activeCharacter: ActiveCharacter | undefined;
  locked: ReadonlySet<AppRoutePath>;
}

/**
 * Mobile-only overflow sheet: the Character-section views that don't fit as
 * primary bottom-tab items, plus Market (which isn't Character-scoped, but the
 * tab bar is full at 3 + More). The Character disclosure leads, mirroring the
 * rail's pinned menu — it is the only route to Settings on a phone. A real
 * modal, not a drawer: it covers the viewport, so the tab bar underneath must
 * not stay reachable — hence the shared `Modal` and its dismissal contract.
 * Links close it on click so it never hangs over the next route.
 */
function MobileMoreSheet({ open, onClose, activeCharacter, locked }: MobileMoreSheetProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} id={MORE_SHEET_ID} onClose={onClose} title={t('nav.more')} placement="sheet">
      <div className="space-y-1 pb-3">
        <SheetCharacterMenu activeCharacter={activeCharacter} onNavigate={onClose} />
        <NavItem
          to="/market"
          label={t('nav.market')}
          locked={locked.has('/market')}
          onClick={onClose}
        />
        <NavItem
          to="/wallet"
          label={t('nav.wallet')}
          locked={locked.has('/wallet')}
          onClick={onClose}
        />
        <NavItem
          to="/planetary-industry"
          label={t('nav.pi')}
          locked={locked.has('/planetary-industry')}
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
          to="/contacts"
          label={t('nav.contacts')}
          locked={locked.has('/contacts')}
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
  useKeyboardShortcuts();
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
          <LogoMark className="size-7 shrink-0" />
          <span className="flex-1 text-xs font-semibold tracking-widest uppercase">
            {t('app.name')}
          </span>
          {isSyncConfigured() && <SyncStatusIndicator />}
        </div>
        {/* `overflow-y-auto` is what makes the character menu below actually
            pinned: the rail is `h-screen`, so without it a tall list (large
            text scale) would push the footer off the bottom instead of
            scrolling. */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <NavItem to="/overview" label={t('nav.overview')} locked={locked.has('/overview')} />
          <NavGroupLabel>{t('nav.groups.progression')}</NavGroupLabel>
          <NavItem to="/skills" label={t('nav.skills')} locked={locked.has('/skills')} />
          <NavItem to="/industry" label={t('nav.industry')} locked={locked.has('/industry')} />
          <NavItem
            to="/planetary-industry"
            label={t('nav.pi')}
            locked={locked.has('/planetary-industry')}
          />
          <NavGroupLabel>{t('nav.groups.economy')}</NavGroupLabel>
          {/* Leads the group: it is the one economy view that answers a
              question before you own anything, and the only one here that
              isn't Character-scoped. */}
          <NavItem to="/market" label={t('nav.market')} locked={locked.has('/market')} />
          <NavItem to="/wallet" label={t('nav.wallet')} locked={locked.has('/wallet')} />
          <NavItem to="/assets" label={t('nav.assets')} locked={locked.has('/assets')} />
          <NavItem to="/orders" label={t('nav.orders')} locked={locked.has('/orders')} />
          <NavItem to="/contracts" label={t('nav.contracts')} locked={locked.has('/contracts')} />
          <NavGroupLabel>{t('nav.groups.social')}</NavGroupLabel>
          <NavItem to="/mail" label={t('nav.mail')} locked={locked.has('/mail')} />
          <NavItem to="/calendar" label={t('nav.calendar')} locked={locked.has('/calendar')} />
          <NavItem to="/contacts" label={t('nav.contacts')} locked={locked.has('/contacts')} />
        </nav>
        <RailCharacterMenu activeCharacter={activeCharacter} />
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-4">
        <AuthFailureNotice />
        <Outlet />
      </main>

      {/* Mobile bottom tab bar: 4 primary destinations + More. Fixed-width
          items (see MOBILE_NAV_ITEM) so the bar never overflows the
          viewport; `env(safe-area-inset-bottom)` keeps it clear of the
          home-indicator gesture area on notched phones. */}
      <nav
        aria-label={t('nav.mobileLabel')}
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <NavLink to="/overview" className={mobileNavClass}>
          <span className="truncate">{t('nav.overview')}</span>
        </NavLink>
        <NavLink to="/skills" className={mobileNavClass}>
          <span className="truncate">{t('nav.skills')}</span>
        </NavLink>
        <NavLink to="/industry" className={mobileNavClass}>
          <span className="truncate">{t('nav.industry')}</span>
        </NavLink>
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
