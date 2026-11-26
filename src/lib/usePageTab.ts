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

export interface RememberedTab<Id extends string> {
  value: Id;
  hydrated: boolean;
}

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

export function useIsPageIndex(page: PageTabs): boolean {
  const { pathname } = useLocation();
  useMediaQuery(page.index?.hiddenFrom ?? 'not all');
  return isIndexPath(page, pathname);
}
