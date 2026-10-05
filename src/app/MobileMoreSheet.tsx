import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { Caret } from '@/components/ui/Disclosure';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { mobileSheetPaths, type MobileTabPath } from '@/lib/mobileTabs';
import { useCorpNavVisible } from '@/features/corp/useCorpNavVisible';
import { useCommandPalette } from '@/features/commandPalette/store';
import { listNavDestinations, railGroups, type NavPage } from './navDestinations';
import { canHide, FOOTER_PAGES, recentNavFor, viewPathFor } from './navRail';
import { useHiddenNav, useRecentNav } from './navPreferences';
import { NavHideToggle, NavItem } from './NavItem';
import type { AppRoutePath } from './routeScopes';

export const MORE_SHEET_ID = 'mobile-more-sheet';

const SHEET_GROUPS = railGroups();
const NO_LOCKS: ReadonlySet<AppRoutePath> = new Set();
const ALL_CORP_VIEWS = { canReadMembers: true, canReadWallet: true, canReadAssets: true };

const TILE_GRID = 'grid grid-cols-4 gap-1.5';
const HEADING = 'text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase';

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
  locked: ReadonlySet<AppRoutePath>;
  tabs: readonly MobileTabPath[];
  unreadAlerts: number;
  /**
   * The active Character's portrait link, which `Layout` owns, given the page
   * to return to once a Character is picked (#1764).
   */
  renderCharacterLink: (originPath: string) => ReactNode;
}

/**
 * The phone's More sheet (scope decision
 * `20261002-145653-rail-opens-the-current-page-icons-hiding-and`): a search
 * field that opens the command palette, a short Recent row, then every page
 * the bottom bar does not hold as icon tiles, grouped like the rail. Pages
 * only — a page's views are reached through its own tabs, Recent and search,
 * which keeps the sheet to about a dozen choices.
 *
 * Pages the pilot hid fold into one row that opens in place, so the sheet
 * still reaches every page (`20260913-095527`'s “never in neither”). Corp
 * shows only while the Character has corp access; Settings, Help and the
 * Character link have permanent rows at the foot.
 *
 * A real modal: it covers the viewport, so the tab bar underneath must not stay
 * reachable. Links close it on click so it never hangs over the next route.
 */
export function MobileMoreSheet({
  open,
  onClose,
  locked,
  tabs,
  unreadAlerts,
  renderCharacterLink,
}: MobileMoreSheetProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const corpVisible = useCorpNavVisible();
  const hidden = useHiddenNav((state) => state.value);
  const recent = useRecentNav((state) => state.value);
  const [showHidden, setShowHidden] = useState(false);
  // The phone's own hide editor: the rail's lives on desktop only.
  const [editing, setEditing] = useState(false);

  // Recent's labels only, so no live lock or corp reads: those decide
  // what a destination is marked with, not what it is called.
  const destinations = useMemo(
    () =>
      listNavDestinations({
        locked: NO_LOCKS,
        corpVisible: true,
        corpCapabilities: ALL_CORP_VIEWS,
        t,
      }),
    [t]
  );
  const byPath = useMemo(
    () => new Map(destinations.map((destination) => [destination.path, destination])),
    [destinations]
  );

  const sheetPaths = new Set<string>(mobileSheetPaths(tabs));
  const inSheet = (page: NavPage) =>
    page.gating === 'corp' ? corpVisible : sheetPaths.has(page.path) && page.path !== '/characters';
  const hiddenSet = new Set(hidden);
  const groups = SHEET_GROUPS.map((group) => ({
    ...group,
    pages: group.pages.filter((page) => inSheet(page) && (editing || !hiddenSet.has(page.path))),
  })).filter((group) => group.pages.length > 0);
  const hiddenPages = SHEET_GROUPS.flatMap((group) =>
    group.pages.filter((page) => inSheet(page) && hiddenSet.has(page.path))
  );
  const recentViews = recentNavFor(recent, viewPathFor(pathname)).flatMap((path) => {
    const destination = byPath.get(path);
    return destination ? [destination] : [];
  });

  function openSearch() {
    onClose();
    // After the sheet's dialog has closed: the palette never opens over another.
    setTimeout(() => useCommandPalette.getState().show(), 0);
  }

  // Corp is in `groups` only while visible (`inSheet`), and never locked.
  const tile = (page: NavPage) => {
    const link = (
      <NavItem
        key={page.path}
        to={page.path}
        label={t(page.labelKey)}
        locked={page.gating === 'scope' && locked.has(page.path)}
        badge={page.path === '/alerts' ? unreadAlerts : undefined}
        presentation="tile"
        onClick={onClose}
      />
    );
    if (!editing || !canHide(page.path)) return link;
    const pageHidden = hiddenSet.has(page.path);
    return (
      <div key={page.path} className={pageHidden ? 'relative opacity-60' : 'relative'}>
        {link}
        <NavHideToggle
          path={page.path}
          label={t(page.labelKey)}
          hidden={pageHidden}
          className="absolute bottom-0.5 left-0.5"
        />
      </div>
    );
  };

  return (
    <Modal
      open={open}
      id={MORE_SHEET_ID}
      onClose={onClose}
      title={t('nav.more')}
      placement="sheet-full"
    >
      {/* Pages from the top; the footer rows sit at the foot, so a tall
          phone leaves the gap between the two rather than above the search. */}
      <div className="flex min-h-full flex-col gap-3 pb-3">
        <button
          type="button"
          onClick={openSearch}
          className={cx(
            'flex min-h-11 items-center gap-2 rounded-xs border border-line-bright bg-panel-2 px-3 text-left text-sm text-text-dim hover:text-text active:bg-panel',
            interactiveClassName,
            focusRingClassName
          )}
        >
          <Icon.Search aria-hidden="true" size={Icon.ICON_SIZE.md} />
          {t('nav.searchPlaceholder')}
        </button>

        {recentViews.length > 0 && (
          <section aria-labelledby={`${MORE_SHEET_ID}-recent`} className="space-y-1.5">
            <h3 id={`${MORE_SHEET_ID}-recent`} className={HEADING}>
              {t('nav.recent')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {recentViews.map((view) => (
                <Link
                  key={view.path}
                  to={view.path}
                  onClick={onClose}
                  className={cx(
                    'flex min-h-11 items-center gap-1.5 rounded-xs border border-line bg-panel-2 px-2 text-xs text-text hover:border-line-bright active:bg-panel',
                    interactiveClassName,
                    focusRingClassName
                  )}
                >
                  <Icon.Recent aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                  {view.breadcrumb}
                </Link>
              ))}
            </div>
          </section>
        )}

        {groups.map((group) => (
          <section
            key={group.id}
            aria-labelledby={group.labelKey ? `${MORE_SHEET_ID}-${group.id}` : undefined}
            className="space-y-1.5"
          >
            {group.labelKey !== null && (
              <h3 id={`${MORE_SHEET_ID}-${group.id}`} className={HEADING}>
                {t(group.labelKey)}
              </h3>
            )}
            <div className={TILE_GRID}>{group.pages.map(tile)}</div>
          </section>
        ))}

        {!editing && hiddenPages.length > 0 && (
          <div className="space-y-1.5 border-t border-line pt-2">
            <button
              type="button"
              aria-expanded={showHidden}
              onClick={() => setShowHidden((shown) => !shown)}
              className={cx(
                'flex min-h-11 w-full items-center gap-2 rounded-xs text-left text-xs text-text-dim',
                interactiveClassName,
                focusRingClassName
              )}
            >
              <Caret expanded={showHidden} />
              <Icon.NavHidden aria-hidden="true" size={Icon.ICON_SIZE.sm} />
              <span className="min-w-0 flex-1 truncate">
                {t('nav.hiddenPages', {
                  count: hiddenPages.length,
                  pages: hiddenPages.map((page) => t(page.labelKey)).join(', '),
                })}
              </span>
              {/* Visual only: `aria-expanded` already says open or closed. */}
              <span aria-hidden="true" className="text-accent">
                {t(showHidden ? 'nav.hiddenCollapse' : 'nav.hiddenExpand')}
              </span>
            </button>
            {showHidden && <div className={TILE_GRID}>{hiddenPages.map(tile)}</div>}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setEditing((on) => !on)}
            className={cx(
              'flex min-h-11 items-center gap-2 rounded-xs text-left text-xs text-text-dim',
              interactiveClassName,
              focusRingClassName
            )}
          >
            <Icon.NavHidden aria-hidden="true" size={Icon.ICON_SIZE.sm} />
            {editing ? t('nav.editDone') : t('nav.editRail')}
          </button>

          <div className="grid grid-cols-2 gap-1.5 border-t border-line pt-2">
            {FOOTER_PAGES.map((page) => (
              <NavItem
                key={page.path}
                to={page.path}
                label={t(page.labelKey)}
                locked={false}
                onClick={onClose}
              />
            ))}
          </div>
          {renderCharacterLink(pathname)}
        </div>
      </div>
    </Modal>
  );
}
