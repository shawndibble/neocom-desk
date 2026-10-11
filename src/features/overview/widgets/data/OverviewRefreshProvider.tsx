import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { OverviewRefreshContext } from './refreshContext';

export function OverviewRefreshProvider({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const refresh = useCallback(() => setEpoch((n) => n + 1), []);
  const value = useMemo(() => ({ epoch, refresh }), [epoch, refresh]);
  return (
    <OverviewRefreshContext.Provider value={value}>{children}</OverviewRefreshContext.Provider>
  );
}
