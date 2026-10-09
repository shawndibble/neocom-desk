import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { tabFromPathname, tabPath, type PageTabs, type TabRouteDefaultState } from '@/lib/pageTabs';
import { useIsPageIndex } from '@/lib/usePageTab';

function stateRecord(state: unknown): Record<string, unknown> {
  return typeof state === 'object' && state !== null && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}

/**
 * Wraps a tabbed page's route element (`App.tsx`, ADR 0015): the bare page
 * path, or a segment naming no tab, is replaced by the default tab's path —
 * a replace, not a push, so Back does not bounce off the redirect. Query
 * string and hash are kept, so a one-shot parameter (`?highlight=`) still
 * reaches the page it was meant for. A page that moved its
 * URLs passes `legacy`, asked first about such a path. A page with an index state (`PageTabs.index`)
 * keeps the bare path below its breakpoint instead.
 */
export function TabRoute({
  page,
  legacy,
  children,
}: {
  page: PageTabs;
  /** The page's pre-tabs URLs: where a path naming no tab used to live, if it did. */
  legacy?: (pathname: string, search: string) => { pathname: string; search: string } | null;
  children: ReactNode;
}) {
  const location = useLocation();
  const isIndex = useIsPageIndex(page);
  if (isIndex || tabFromPathname(page, location.pathname) !== null) return <>{children}</>;
  const moved = legacy?.(location.pathname, location.search);
  if (moved) {
    return <Navigate replace to={{ ...moved, hash: location.hash }} state={location.state} />;
  }
  return (
    <Navigate
      replace
      to={{
        pathname: tabPath(page, page.defaultTab),
        search: location.search,
        hash: location.hash,
      }}
      state={
        { ...stateRecord(location.state), tabRouteDefaulted: true } satisfies TabRouteDefaultState
      }
    />
  );
}
