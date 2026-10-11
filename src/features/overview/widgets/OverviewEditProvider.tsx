import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { OverviewEditContext } from './editContext';

export function OverviewEditProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const startEditing = useCallback(() => setEditing(true), []);
  const done = useCallback(() => setEditing(false), []);
  const cancel = useCallback(() => setEditing(false), []);
  const value = useMemo(
    () => ({ editing, startEditing, done, cancel }),
    [editing, startEditing, done, cancel]
  );
  return <OverviewEditContext.Provider value={value}>{children}</OverviewEditContext.Provider>;
}
