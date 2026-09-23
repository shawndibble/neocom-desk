import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { tabFromPathname, tabPath, type PageTabs } from '@/lib/pageTabs';

/**
 * Wraps a tabbed page's route element (`App.tsx`, ADR 0015): the bare page
 * path, or a segment naming no tab, is replaced by the default tab's path —
 * a replace, not a push, so Back does not bounce off the redirect. Query
 * string and hash are kept, so a one-shot parameter (`?highlight=`) still
 * reaches the page it was meant for.
 */
export function TabRoute({ page, children }: { page: PageTabs; children: ReactNode }) {
  const location = useLocation();
  if (tabFromPathname(page, location.pathname) !== null) return <>{children}</>;
  return (
    <Navigate
      replace
      to={{
        pathname: tabPath(page, page.defaultTab),
        search: location.search,
        hash: location.hash,
      }}
      state={location.state}
    />
  );
}
