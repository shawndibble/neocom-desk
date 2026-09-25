import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { tabFromPathname, tabPath, type PageTabs } from '@/lib/pageTabs';
import { useIsPageIndex } from '@/lib/usePageTab';

/**
 * Marker this redirect's own `state` carries, so a page whose default tab
 * hides a sub-choice (Contracts' Items/Courier mode) can tell "this is the
 * generic default landing" apart from an explicit deep link that happens to
 * name that same tab path — `tabFromPathname` resolves both identically, and
 * only `TabRoute` itself, at the moment it decides to redirect, knows which
 * one this was.
 */
export interface TabRouteDefaultState {
  tabRouteDefaulted?: boolean;
}

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
 * reaches the page it was meant for. A page with an index state (`PageTabs.index`)
 * keeps the bare path below its breakpoint instead.
 */
export function TabRoute({ page, children }: { page: PageTabs; children: ReactNode }) {
  const location = useLocation();
  const isIndex = useIsPageIndex(page);
  if (isIndex || tabFromPathname(page, location.pathname) !== null) return <>{children}</>;
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
