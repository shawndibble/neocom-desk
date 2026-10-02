import { Fragment, useId, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { commandPaletteDisplayKey, isApplePlatform } from '@/lib/shortcuts';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useCorpNavVisible } from '@/features/corp/useCorpNavVisible';
import { useCommandPalette } from '@/features/commandPalette/store';
import { useLockedRoutes } from './useGrantedScopes';
import {
  listNavDestinations,
  NAV_LOCK_PATHS,
  railGroups,
  type NavDestination,
  type NavPage,
  type NavPagePath,
} from './navDestinations';
import { canHide, currentPagePath, viewPathFor, viewsByPage } from './navRail';
import { toggleHiddenNav, useHiddenNav } from './navPreferences';
import { CorpNavItem, NavItem } from './NavItem';

const APPLE = isApplePlatform();
const RAIL_GROUPS = railGroups();

/**
 * Opens the command palette — a button, not a second search field (scope
 * decision `20261002-145653-go-to-button-opens-the-command-palette`). “Go to”
 * and a caret rather than “Search” and a magnifier, so it never reads as the
 * filter for the page underneath. The chord is printed on it, which is how
 * the shortcut gets learned.
 */
function GoToButton() {
  const { t } = useTranslation();
  const chord = commandPaletteDisplayKey(APPLE);
  return (
    <button
      type="button"
      onClick={() => useCommandPalette.getState().show()}
      aria-keyshortcuts={APPLE ? 'Meta+K' : 'Control+K'}
      className="mx-2 mt-2 flex min-h-8 items-center gap-2 rounded-xs border border-line-bright bg-panel-2 px-2 text-xs text-text-dim transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Icon.GoTo aria-hidden="true" size={Icon.ICON_SIZE.sm} />
      <span>{t('nav.goTo')}</span>
      <kbd className="ml-auto rounded-xs border border-line px-1 font-sans text-[0.625rem]">
        {chord}
      </kbd>
    </button>
  );
}

/** Small heading introducing a group of pages in the rail. */
function NavGroupLabel({ children }: { children: string }) {
  return (
    <p className="mt-3 px-2 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
      {children}
    </p>
  );
}

interface RailPageProps {
  page: NavPage;
  views: readonly NavDestination[];
  open: boolean;
  onToggle: () => void;
  locked: boolean;
  badge?: number;
  hidden: ReadonlySet<string>;
  editing: boolean;
  activeViewPath: string | null;
}

/**
 * One page in the rail, with its views under it while open. The link
 * navigates; the caret beside it only opens or closes the list, so a pilot can
 * look inside a page without leaving the one they are on.
 */
function RailPage({
  page,
  views,
  open,
  onToggle,
  locked,
  badge,
  hidden,
  editing,
  activeViewPath,
}: RailPageProps) {
  const { t } = useTranslation();
  const listId = useId();
  const label = t(page.labelKey);
  const pageHidden = hidden.has(page.path);
  // The view you are on stays listed even if hidden, as its page does.
  const shownViews = editing
    ? views
    : views.filter((view) => !hidden.has(view.path) || view.path === activeViewPath);

  return (
    <div>
      <div className="flex items-center gap-0.5">
        {page.gating === 'corp' ? (
          <CorpNavItem className="flex-1" />
        ) : (
          <NavItem
            to={page.path}
            label={label}
            locked={locked}
            badge={badge}
            className={cx('flex-1', pageHidden && 'line-through opacity-60')}
          />
        )}
        {shownViews.length > 0 && (
          <IconButton
            variant="plain"
            size="sm"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={listId}
            label={t('nav.pageViews', { page: label })}
            icon={open ? <Icon.Expanded /> : <Icon.Descend />}
          />
        )}
        {editing && canHide(page.path) && (
          <IconButton
            variant="plain"
            size="sm"
            icon={pageHidden ? <Icon.NavHidden /> : <Icon.NavShown />}
            label={t('nav.showInNav', { page: label })}
            pressed={!pageHidden}
            onClick={() => toggleHiddenNav(page.path)}
          />
        )}
      </div>
      {open && shownViews.length > 0 && (
        <ul id={listId} aria-label={label} className="mt-0.5 mb-1 ml-4 border-l border-line">
          {shownViews.map((view) => {
            const viewHidden = hidden.has(view.path);
            const active = view.path === activeViewPath;
            return (
              <li key={view.path} className="flex items-center">
                <Link
                  to={view.path}
                  aria-current={active ? 'page' : undefined}
                  title={view.locked ? t('reauth.navLocked') : undefined}
                  className={cx(
                    '-ml-px flex min-h-7 min-w-0 flex-1 items-center gap-1.5 border-l py-1 pr-1 pl-3 text-xs transition-colors',
                    active
                      ? 'border-accent text-accent'
                      : 'border-transparent text-text-dim hover:text-text',
                    viewHidden && 'line-through opacity-60'
                  )}
                >
                  <span className="min-w-0 truncate">{view.label}</span>
                  {view.locked && (
                    <span
                      aria-hidden="true"
                      className="ml-auto size-1.5 shrink-0 rounded-full bg-warning"
                    />
                  )}
                </Link>
                {editing && (
                  <IconButton
                    variant="plain"
                    size="sm"
                    icon={viewHidden ? <Icon.NavHidden /> : <Icon.NavShown />}
                    label={t('nav.showInNav', { page: view.label })}
                    pressed={!viewHidden}
                    onClick={() => toggleHiddenNav(view.path)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The desktop rail's pages (scope decision
 * `20261002-145653-rail-opens-the-current-page-icons-hiding-and`): the Go to
 * button, then each group's pages with the current page's views open under
 * it. Any other page's caret opens it to look inside; changing pages closes
 * it again, leaving only the page you land on open. Pages and views the pilot
 * hid stay out, unless one is where they are — the rail always shows the
 * pilot where they stand.
 *
 * Its own component because it reads the location, which `Layout` must not.
 */
export function RailNav({ unreadAlerts }: { unreadAlerts: number }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const current = currentPagePath(pathname);
  const activeViewPath = viewPathFor(pathname);
  const locked = useLockedRoutes(NAV_LOCK_PATHS);
  const corpVisible = useCorpNavVisible();
  const { capabilities } = useCorpAccess();
  const hiddenList = useHiddenNav((state) => state.value);
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);
  const [editing, setEditing] = useState(false);

  // The one open section. Arriving on a new page resets it to that page,
  // which is what closes a section opened only to look inside.
  const [open, setOpen] = useState<{ for: NavPagePath | null; path: string | null }>({
    for: current,
    path: current,
  });
  if (open.for !== current) setOpen({ for: current, path: current });

  const views = useMemo(
    () =>
      viewsByPage(listNavDestinations({ locked, corpVisible, corpCapabilities: capabilities, t })),
    [locked, corpVisible, capabilities, t]
  );

  const hiddenCount = hiddenList.filter((path) => canHide(path)).length;

  return (
    <>
      <GoToButton />
      <nav
        aria-label={t('nav.railLabel')}
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
      >
        {editing && (
          <div className="mb-1 rounded-xs border border-accent-dim bg-panel-2 p-2 text-xs text-text">
            <p>{t('nav.editHint')}</p>
            <Button size="sm" className="mt-2" onClick={() => setEditing(false)}>
              {t('nav.editDone')}
            </Button>
          </div>
        )}
        {RAIL_GROUPS.map((group) => {
          const pages = group.pages.filter(
            (page) =>
              (page.gating !== 'corp' || corpVisible) &&
              (editing || !hidden.has(page.path) || page.path === current)
          );
          // A heading over nothing would strand itself.
          if (pages.length === 0) return null;
          return (
            <Fragment key={group.id}>
              {group.labelKey !== null && <NavGroupLabel>{t(group.labelKey)}</NavGroupLabel>}
              {pages.map((page) => (
                <RailPage
                  key={page.path}
                  page={page}
                  views={views.get(page.path) ?? []}
                  open={open.path === page.path}
                  onToggle={() =>
                    setOpen((state) => ({
                      ...state,
                      path: state.path === page.path ? null : page.path,
                    }))
                  }
                  locked={page.gating === 'scope' && locked.has(page.path)}
                  badge={page.path === '/alerts' ? unreadAlerts : undefined}
                  hidden={hidden}
                  editing={editing}
                  activeViewPath={activeViewPath}
                />
              ))}
            </Fragment>
          );
        })}
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 flex min-h-7 items-center gap-1.5 rounded-xs px-2 text-left text-[0.6875rem] text-text-dim transition-colors hover:bg-panel-2 hover:text-text"
          >
            <Icon.NavHidden aria-hidden="true" size={Icon.ICON_SIZE.sm} />
            {hiddenCount > 0 ? t('nav.hiddenCount', { count: hiddenCount }) : t('nav.editRail')}
          </button>
        )}
      </nav>
    </>
  );
}
