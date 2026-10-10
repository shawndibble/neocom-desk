import { Fragment, memo, useCallback, useId, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Tooltip } from '@/components/ui';
import { Caret } from '@/components/ui/Disclosure';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { commandPaletteDisplayKey, isApplePlatform } from '@/lib/shortcuts';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useActiveCorporationId } from '@/features/corp/owner';
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
import { canHide, navPlaceFor, viewsByPage } from './navRail';
import { toggleHiddenNav, useHiddenNav } from './navPreferences';
import { NavHideToggle, NavItem } from './NavItem';

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
      className={cx(
        'mx-2 mt-2 flex min-h-8 items-center gap-2 rounded-xs border border-line-bright bg-panel-2 px-2 text-xs text-text-dim hover:text-text active:bg-panel',
        interactiveClassName,
        focusRingClassName
      )}
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
  onToggle: (path: string) => void;
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
const RailPage = memo(function RailPage({
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
        {/* Corp is listed only while visible (`RailNavBody` filters it), and never locked. */}
        <NavItem
          to={page.path}
          label={label}
          locked={locked}
          badge={badge}
          className={cx('flex-1', pageHidden && 'line-through opacity-60')}
        />
        {shownViews.length > 0 && (
          <IconButton
            variant="plain"
            size="sm"
            onClick={() => onToggle(page.path)}
            aria-expanded={open}
            aria-controls={listId}
            label={t('nav.pageViews', { page: label })}
            icon={<Caret expanded={open} />}
          />
        )}
        {editing && canHide(page.path) && (
          <NavHideToggle path={page.path} label={label} hidden={pageHidden} />
        )}
      </div>
      {open && shownViews.length > 0 && (
        <ul id={listId} aria-label={label} className="mt-0.5 mb-1 ml-4 border-l border-line">
          {shownViews.map((view) => {
            const viewHidden = hidden.has(view.path);
            const active = view.path === activeViewPath;
            const link = (
              <Link
                to={view.path}
                aria-current={active ? 'page' : undefined}
                data-locked={view.locked ? 'true' : undefined}
                className={cx(
                  '-ml-px flex min-h-7 min-w-0 flex-1 items-center gap-1.5 border-l py-1 pr-1 pl-3 text-xs',
                  interactiveClassName,
                  focusRingInsetClassName,
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-dim hover:text-text active:bg-panel-2',
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
            );
            return (
              <li key={view.path} className="flex items-center">
                {view.locked ? <Tooltip content={t('reauth.navLocked')}>{link}</Tooltip> : link}
                {editing && (
                  <NavHideToggle path={view.path} label={view.label} hidden={viewHidden} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

/**
 * The desktop rail's pages (scope decision
 * `20261002-145653-rail-opens-the-current-page-icons-hiding-and`): the Go to
 * button, then each group's pages with the current page's views open under
 * it. Any other page's caret opens it to look inside; changing pages closes
 * it again, leaving only the page you land on open. Pages and views the pilot
 * hid stay out, unless one is where they are — the rail always shows the
 * pilot where they stand.
 *
 * Its own component because it reads the location, which `Layout` must not;
 * the body is memoized on the place it derives, so a query-string write (a
 * page's filters, as the pilot types) re-renders this wrapper alone.
 */
export function RailNav({ unreadAlerts }: { unreadAlerts: number }) {
  const { pathname } = useLocation();
  const { pagePath, viewPath } = navPlaceFor(pathname);
  return <RailNavBody unreadAlerts={unreadAlerts} current={pagePath} activeViewPath={viewPath} />;
}

const RailNavBody = memo(function RailNavBody({
  unreadAlerts,
  current,
  activeViewPath,
}: {
  unreadAlerts: number;
  current: NavPagePath | null;
  activeViewPath: string | null;
}) {
  const { t } = useTranslation();
  const locked = useLockedRoutes(NAV_LOCK_PATHS);
  // One corp-access read for the rail (`useCorpNavVisible` is the same read).
  const { state: corpState, capabilities } = useCorpAccess();
  const corporationId = useActiveCorporationId();
  const corpVisible = corpState === 'ready' && corporationId !== null;
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

  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  // Pages the short rail leaves out, flat and in nav order (no headings: one
  // level, not a second tree). The page you are on stays in its own group.
  const morePages = RAIL_GROUPS.flatMap((group) => group.pages).filter(
    (page) =>
      (page.gating !== 'corp' || corpVisible) && hidden.has(page.path) && page.path !== current
  );
  const toggleOpen = useCallback(
    (path: string) => setOpen((state) => ({ ...state, path: state.path === path ? null : path })),
    []
  );

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
                  onToggle={toggleOpen}
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
        {!editing && morePages.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setMoreOpen((now) => !now)}
              aria-expanded={moreOpen}
              aria-controls={moreId}
              className={cx(
                'flex min-h-8 w-full items-center gap-1.5 rounded-xs px-2 text-left text-xs text-text-dim hover:text-text',
                rowInteractiveClassName,
                focusRingClassName
              )}
            >
              <span className="min-w-0 flex-1">
                {t('nav.morePages', { count: morePages.length })}
              </span>
              <Caret expanded={moreOpen} />
            </button>
            {moreOpen && (
              <ul id={moreId} className="mt-0.5 flex flex-col gap-0.5">
                {morePages.map((page) => {
                  const label = t(page.labelKey);
                  return (
                    <li key={page.path} className="flex items-center gap-0.5 opacity-60">
                      <NavItem
                        to={page.path}
                        label={label}
                        locked={page.gating === 'scope' && locked.has(page.path)}
                        badge={page.path === '/alerts' ? unreadAlerts : undefined}
                        className="flex-1"
                      />
                      <IconButton
                        variant="plain"
                        size="sm"
                        icon={<Icon.AddRow />}
                        label={t('nav.showPermanently', { page: label })}
                        onClick={() => toggleHiddenNav(page.path)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cx(
              'mt-3 flex min-h-7 items-center gap-1.5 rounded-xs px-2 text-left text-[0.6875rem] text-text-dim hover:text-text',
              rowInteractiveClassName,
              focusRingClassName
            )}
          >
            <Icon.NavHidden aria-hidden="true" size={Icon.ICON_SIZE.sm} />
            {t('nav.customize')}
          </button>
        )}
      </nav>
    </>
  );
});
