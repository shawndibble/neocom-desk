import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { characterPortraitUrl } from './images';
import { useActiveCharacter } from '@/stores/activeCharacter';

const NAV_LINK =
  'flex items-center gap-2 rounded-xs border border-transparent px-3 py-2 text-xs font-semibold tracking-widest uppercase transition-colors';
const NAV_ACTIVE = 'border-line-bright bg-panel-2 text-accent';
const NAV_IDLE = 'text-text-dim hover:bg-panel-2 hover:text-text';

function navClass({ isActive }: { isActive: boolean }): string {
  return `${NAV_LINK} ${isActive ? NAV_ACTIVE : NAV_IDLE}`;
}

function DisabledNavItem({ label, soon }: { label: string; soon: string }) {
  return (
    <span aria-disabled="true" className={`${NAV_LINK} cursor-not-allowed text-text-faint`}>
      {label}
      <span className="ml-auto rounded-xs border border-line px-1 text-[10px] normal-case">
        {soon}
      </span>
    </span>
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
          <span className="text-xs font-semibold tracking-widest uppercase">{t('app.name')}</span>
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
          <DisabledNavItem label={t('nav.industry')} soon={t('nav.soon')} />
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

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line bg-panel/95 backdrop-blur-sm md:hidden">
        <NavLink to="/characters" className={navClass}>
          {t('nav.characters')}
        </NavLink>
        <NavLink to="/overview" className={navClass}>
          {t('nav.overview')}
        </NavLink>
        <NavLink to="/skills" className={navClass}>
          {t('nav.skills')}
        </NavLink>
        {activeCharacter && (
          <Link
            to="/characters"
            aria-label={t('nav.switchCharacter')}
            className="flex items-center px-3 py-2"
          >
            <img
              src={characterPortraitUrl(activeCharacter.characterId, 64)}
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-xs border border-line"
            />
          </Link>
        )}
      </nav>
    </div>
  );
}
