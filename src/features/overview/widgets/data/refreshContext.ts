/**
 * The Overview's refresh epoch: a counter every data source watches. The
 * header's Refresh and a failed widget's Retry both bump it, and each source
 * that is mounted reloads once per bump, so one control refreshes exactly what
 * is on the page (a widget the pilot never added never fetches).
 */
import { createContext, useContext } from 'react';

export interface OverviewRefresh {
  epoch: number;
  refresh: () => void;
}

export const OverviewRefreshContext = createContext<OverviewRefresh>({
  epoch: 0,
  refresh: () => undefined,
});

export function useOverviewRefresh(): OverviewRefresh {
  return useContext(OverviewRefreshContext);
}
