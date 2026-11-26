import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { tabFromPathname, tabPath, type PageTabs, type TabRouteDefaultState } from '@/lib/pageTabs';
import { useIsPageIndex } from '@/lib/usePageTab';

function stateRecord(state: unknown): Record<string, unknown> {
  return typeof state === 'object' && state !== null && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : {};
}

export function TabRoute({
  page,
  legacy,
  children,
}: {
  page: PageTabs;
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
