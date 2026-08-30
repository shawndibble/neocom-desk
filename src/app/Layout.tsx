import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { characterPortraitUrl } from './images';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { isSyncConfigured } from './syncStatus';
import { SyncStatusDot } from './SyncStatusDot';
import { useSyncStatus } from './useSyncStatus';
import { Modal } from '@/components/ui';

/**
 * Sync status dot, gated on Firebase being configured at all (see
 * syncStatus.ts) — hidden entirely rather than shown permanently idle, since
 * an unconfigured app never syncs and a dot with nothing behind it just begs
 * the "why isn't this working" question.
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

const MORE_SHEET_ID = 'mobile-more-sheet';

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  activeCharacter: { characterId: number; name: string } | undefined;
}

/**
 * Mobile-only overflow sheet (UX-REVIEW #4/#8): the six Character-section
 * views that don't fit as primary bottom-tab-bar items, plus the "switch
 * character" link that used to occupy the tab bar's fifth slot, plus Market
 * (character-agnostic, so it doesn't belong grouped with the Character
 * section, but the bottom tab bar is already full at 4 primary destinations
 * + More). It is a real modal, not just a drawer: it covers the viewport and
 * the tab bar underneath it must not stay reachable, so it goes through the
 * shared Modal primitive and inherits its dismissal contract — Escape closes,
 * backdrop click closes, focus returns to the More trigger. Links also close it
 * on click so it never hangs over the next route.
 */
function MobileMoreSheet({ open, onClose, activeCharacter }: MobileMoreSheetProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      id={MORE_SHEET_ID}
      onClose={onClose}
      title={t('nav.more')}
      placement="sheet"
      className="md:hidden"
    >
      <div className="space-y-1 pb-3">
        <NavLink to="/market" onClick={onClose} className={navClass}>
          {t('nav.market')}
        </NavLink>
        {activeCharacter && (
          <Link
            to="/characters"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xs border border-transparent px-3 py-2 transition-colors hover:bg-panel-2"
          >
            <img
              src={characterPortraitUrl(activeCharacter.characterId, 64)}
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-xs border border-line"
            />
            <span className="min-w-0 truncate text-xs">{activeCharacter.name}</span>
          </Link>
        )}
        <NavLink to="/wallet" onClick={onClose} className={navClass}>
          {t('nav.wallet')}
        </NavLink>
        <NavLink to="/assets" onClick={onClose} className={navClass}>
          {t('nav.assets')}
        </NavLink>
        <NavLink to="/mail" onClick={onClose} className={navClass}>
          {t('nav.mail')}
        </NavLink>
        <NavLink to="/calendar" onClick={onClose} className={navClass}>
          {t('nav.calendar')}
        </NavLink>
        <NavLink to="/contracts" onClick={onClose} className={navClass}>
          {t('nav.contracts')}
        </NavLink>
        <NavLink to="/orders" onClick={onClose} className={navClass}>
          {t('nav.orders')}
        </NavLink>
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

  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  // The sheet is mobile-only (`md:hidden`), but showModal() makes the page
  // inert regardless of the dialog's own display — a viewport growing past the
  // md breakpoint while it is open would leave an invisible modal holding the
  // app hostage. Close it at the breakpoint instead.
  useEffect(() => {
    if (!moreOpen) return;
    const desktop = window.matchMedia('(min-width: 48rem)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMoreOpen(false);
    };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, [moreOpen]);

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
          <NavLink to="/market" className={navClass}>
            {t('nav.market')}
          </NavLink>
          <p className="mt-3 px-3 text-[10px] font-semibold tracking-widest text-text-faint uppercase">
            {t('nav.characterSection')}
          </p>
          <NavLink to="/wallet" className={navClass}>
            {t('nav.wallet')}
          </NavLink>
          <NavLink to="/assets" className={navClass}>
            {t('nav.assets')}
          </NavLink>
          <NavLink to="/mail" className={navClass}>
            {t('nav.mail')}
          </NavLink>
          <NavLink to="/calendar" className={navClass}>
            {t('nav.calendar')}
          </NavLink>
          <NavLink to="/contracts" className={navClass}>
            {t('nav.contracts')}
          </NavLink>
          <NavLink to="/orders" className={navClass}>
            {t('nav.orders')}
          </NavLink>
        </nav>
        {activeCharacter && (
          <Link
            to="/characters"
            aria-label={t('nav.switchCharacter')}
            className="flex items-center gap-2 border-t border-line p-2 transition-colors hover:bg-panel-2"
          >
            <img
              src={characterPortraitUrl(activeCharacter.characterId, 64)}
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-xs border border-line"
            />
            <span className="min-w-0 truncate text-xs">{activeCharacter.name}</span>
          </Link>
        )}
      </aside>

      <main className="min-w-0 flex-1 p-4 pb-20 md:pb-4">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar: 4 primary destinations + More (UX-REVIEW #4). */}
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

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        activeCharacter={activeCharacter}
      />
    </div>
  );
}
