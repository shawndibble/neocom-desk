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
