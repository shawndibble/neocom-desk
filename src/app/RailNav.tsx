import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useNavBadges } from './navBadges';
import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, Tooltip } from '@/components/ui';
import { Caret } from '@/components/ui/Disclosure';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import {
  claimSessionHint,
  hintSeenCount,
  recordHintSeen,
  useHintCounts,
  useSessionHintShown,
} from '@/lib/hintFlags';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import {
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import { commandPaletteDisplayKey, isApplePlatform } from '@/lib/shortcuts';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useCorpViewCapabilities } from '@/features/corp/useCorpViewCapabilities';
import { useSrpNavVisible } from '@/features/corp/srp/useSrpNavVisible';
import { useActiveCorporationId } from '@/features/corp/owner';
import { useHiddenTabPaths } from './useHiddenTabPaths';
import { useCommandPalette } from '@/features/commandPalette/store';
import { useLockedRoutes } from './useGrantedScopes';
import {
  isNavPageAvailable,
  listNavDestinations,
  NAV_LOCK_PATHS,
  railGroups,
  type NavDestination,
  type NavPage,
  type NavPagePath,
} from './navDestinations';
import { canHide, navPlaceFor, viewsByPage } from './navRail';
import { useHiddenNav } from './navPreferences';
import { NavHideToggle, NavItem } from './NavItem';

const APPLE = isApplePlatform();
const RAIL_GROUPS = railGroups();

const GO_TO_HINT = 'goTo';

function useGoToNudge(): boolean {
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  const hydrated = useHintCounts((state) => state.hydrated);
  const seen = useHintCounts((state) => hintSeenCount(state.value, GO_TO_HINT) > 0);
  const paletteOpen = useCommandPalette((state) => state.open);
  const holdsHint = useSessionHintShown(GO_TO_HINT);
  useEffect(() => {
    if (isDesktop && hydrated && !seen) claimSessionHint(GO_TO_HINT);
  }, [isDesktop, hydrated, seen]);
  useEffect(() => {
    if (paletteOpen && holdsHint) recordHintSeen(GO_TO_HINT);
  }, [paletteOpen, holdsHint]);
  return holdsHint && !seen;
}

function GoToButton() {
  const { t } = useTranslation();
  const chord = commandPaletteDisplayKey(APPLE);
  const nudge = useGoToNudge();
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
      {nudge && (
        <span className="rounded-xs bg-accent px-1 text-[0.6875rem] font-semibold tracking-widest text-accent-contrast uppercase">
          {t('nav.goToNew')}
        </span>
      )}
      <kbd className="ml-auto rounded-xs border border-line px-1 font-sans text-[0.6875rem]">
        {chord}
      </kbd>
    </button>
  );
}

function NavGroupLabel({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className={`${eyebrowClassName} mt-3 px-2`}>
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
  hidden: ReadonlySet<string>;
  editing: boolean;
  activeViewPath: string | null;
  badge?: number;
  badgeLabelKey?: string;
  attention?: boolean;
}

const RailPage = memo(function RailPage({
  page,
  views,
  open,
  onToggle,
  locked,
  hidden,
  editing,
  activeViewPath,
  badge,
  badgeLabelKey,
  attention,
}: RailPageProps) {
  const { t } = useTranslation();
  const listId = useId();
  const label = t(page.labelKey);
  const pageHidden = hidden.has(page.path);
  const shownViews = editing
    ? views
    : views.filter((view) => !hidden.has(view.path) || view.path === activeViewPath);

  return (
    <div>
      <div className="flex items-center gap-0.5">
        <NavItem
          to={page.path}
          label={label}
          locked={locked}
          badge={badge}
          badgeLabelKey={badgeLabelKey}
          attention={attention}
          className={cx('flex-1', editing && pageHidden && 'line-through')}
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
                  editing && viewHidden && 'line-through'
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

export function RailNav() {
  const { pathname } = useLocation();
  const { pagePath, viewPath } = navPlaceFor(pathname);
  return <RailNavBody current={pagePath} activeViewPath={viewPath} />;
}

const RailNavBody = memo(function RailNavBody({
  current,
  activeViewPath,
}: {
  current: NavPagePath | null;
  activeViewPath: string | null;
}) {
  const { t } = useTranslation();
  const locked = useLockedRoutes(NAV_LOCK_PATHS);
  const navBadge = useNavBadges();
  const { state: corpState } = useCorpAccess();
  const capabilities = useCorpViewCapabilities();
  const corporationId = useActiveCorporationId();
  const corpVisible = corpState === 'ready' && corporationId !== null;
  const srpVisible = useSrpNavVisible();
  const hiddenList = useHiddenNav((state) => state.value);
  const hidden = useMemo(() => new Set(hiddenList), [hiddenList]);
  const [editing, setEditing] = useState(false);
  const focusAfterCommit = useFocusAfterCommit();
  const doneRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const marked = navRef.current?.querySelectorAll('[aria-current="page"]') ?? [];
    marked[marked.length - 1]?.scrollIntoView?.({ block: 'nearest' });
  }, [current, activeViewPath]);

  const [open, setOpen] = useState<{ for: NavPagePath | null; path: string | null }>({
    for: current,
    path: current,
  });
  if (open.for !== current) setOpen({ for: current, path: current });

  const hiddenTabPaths = useHiddenTabPaths();
  const views = useMemo(
    () =>
      viewsByPage(
        listNavDestinations({
          locked,
          corpVisible,
          corpCapabilities: capabilities,
          srpVisible,
          t,
          hiddenTabPaths,
        })
      ),
    [locked, corpVisible, capabilities, srpVisible, t, hiddenTabPaths]
  );

  const groupId = useId();
  const toggleOpen = useCallback(
    (path: string) => setOpen((state) => ({ ...state, path: state.path === path ? null : path })),
    []
  );

  return (
    <>
      <GoToButton />
      <nav
        ref={navRef}
        aria-label={t('nav.railLabel')}
        className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2"
      >
        {editing && (
          <div className="mb-1 rounded-xs border border-accent-dim bg-panel-2 p-2 text-xs text-text">
            <p>{t('nav.editHint')}</p>
            <Button
              ref={doneRef}
              size="sm"
              className="mt-2"
              onClick={() => {
                setEditing(false);
                focusAfterCommit(editRef);
              }}
            >
              {t('nav.editDone')}
            </Button>
          </div>
        )}
        {RAIL_GROUPS.map((group) => {
          const pages = group.pages.filter(
            (page) =>
              isNavPageAvailable(page, corpVisible, capabilities) &&
              (editing || !hidden.has(page.path) || page.path === current)
          );
          if (pages.length === 0) return null;
          return (
            <Fragment key={group.id}>
              {group.labelKey !== null && (
                <NavGroupLabel id={`${groupId}-${group.id}`}>{t(group.labelKey)}</NavGroupLabel>
              )}
              <div
                role={group.labelKey !== null ? 'group' : undefined}
                aria-labelledby={group.labelKey !== null ? `${groupId}-${group.id}` : undefined}
                className="flex flex-col gap-0.5"
              >
                {pages.map((page) => (
                  <RailPage
                    key={page.path}
                    page={page}
                    views={views.get(page.path) ?? []}
                    open={open.path === page.path}
                    onToggle={toggleOpen}
                    locked={page.gating === 'scope' && locked.has(page.path)}
                    hidden={hidden}
                    editing={editing}
                    activeViewPath={activeViewPath}
                    {...navBadge(page.path)}
                  />
                ))}
              </div>
            </Fragment>
          );
        })}
        {!editing && (
          <button
            ref={editRef}
            type="button"
            onClick={() => {
              setEditing(true);
              focusAfterCommit(doneRef);
            }}
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
