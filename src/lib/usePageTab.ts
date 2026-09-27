/**
 * The active tab of a tabbed page, read from — and written to — the path
 * (ADR 0015). A tab switch is a history *push*: Back returns to the previous
 * tab, as it would between two pages. The query string rides along, since a
 * page's filters are its own and typically shared by its tabs.
 *
 * An unknown or missing segment reads as the default tab here; `TabRoute`
 * (`app/TabRoute.tsx`) is what rewrites such a URL to the real tab path.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  isIndexPath,
  isTabRouteDefaulted,
  tabFromPathname,
  tabPath,
  type PageTabs,
} from './pageTabs';
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

/** A tab's remembered default: the stored tab, and whether the store has read it yet. */
export interface RememberedTab<Id extends string> {
  value: Id;
  hydrated: boolean;
}

/**
 * `usePageTab` with a remembered default behind the tab — the tab-segment
 * side of `useRememberedUrlParams` (`./useUrlState.ts`), under the same rule
 * (scope decision `20260922-221531`): a URL that names a tab wins, and only a
 * visit that names none gets the stored one.
 *
 * "Names none" is `TabRoute`'s own default-tab landing (`isTabRouteDefaulted`)
 * — the resolved tab id alone reads the same for a bare visit and for an
 * explicit link to the default tab. Unlike a query field, the path has to
 * name *some* tab, so that landing is swapped for the stored one: a replace,
 * not a push, since a silent restore on first paint is not a place Back
 * should return to. Decided once, when the store hydrates: a later change to
 * the stored value comes from an edit the page already navigated for.
 *
 * Read-only: storing a tab choice is the caller's, since not every switch is
 * one worth remembering.
 */
export function useRememberedPageTab<Id extends string>(
  page: PageTabs<Id>,
  remembered: RememberedTab<Id>
): [Id, (id: Id) => void] {
  const [tab, selectTab] = usePageTab(page);
  const location = useLocation();
  const navigate = useNavigate();
  const landedOnDefault = isTabRouteDefaulted(location.state);
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !remembered.hydrated) return;
    decided.current = true;
    if (!landedOnDefault || remembered.value === tab) return;
    navigate(
      { pathname: tabPath(page, remembered.value), search: location.search, hash: location.hash },
      { replace: true, state: null }
    );
  }, [
    remembered.hydrated,
    remembered.value,
    landedOnDefault,
    tab,
    page,
    location.search,
    location.hash,
    navigate,
  ]);
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
