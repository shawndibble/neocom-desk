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
import { tabFromPathname, tabPath, type PageTabs } from './pageTabs';

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
