/**
 * The active tab of a tabbed page, read from — and written to — the path
 * (ADR 0015). A tab switch is a history *push*: Back returns to the previous
 * tab, as it would between two pages. The query string rides along, since a
 * page's filters are its own and typically shared by its tabs.
 *
 * An unknown or missing segment reads as the default tab here; `TabRoute`
 * (`app/TabRoute.tsx`) is what rewrites such a URL to the real tab path.
 */
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isIndexPath, tabFromPathname, tabPath, type PageTabs } from './pageTabs';
import { useMediaQuery } from './useMediaQuery';

export function usePageTab<Id extends string>(page: PageTabs<Id>): [Id, (id: Id) => void] {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabFromPathname(page, location.pathname) ?? page.defaultTab;

  const selectTab = useCallback(
    (id: Id) => {
      if (id === tab) return;
      navigate({ pathname: tabPath(page, id), search: location.search });
    },
    [navigate, page, tab, location.search]
  );

  return [tab, selectTab];
}

/**
 * Whether `page`'s index state is showing (`PageTabs.index`): the bare base
 * path below the index's breakpoint. Follows a resize across the breakpoint.
 * Always false for a page that declares no index.
 */
export function useIsPageIndex(page: PageTabs): boolean {
  const { pathname } = useLocation();
  // Subscribes to the breakpoint; `isIndexPath` is what answers, so the first
  // render and a later change agree. The never-matching fallback query is
  // only for a page with no index, which has nothing to track.
  useMediaQuery(page.index?.hiddenFrom ?? 'not all');
  return isIndexPath(page, pathname);
}
