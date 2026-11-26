import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { PageHeaderSlotContext } from './pageHeaderSlot';

export function PageHeaderSlotProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<readonly HTMLElement[]>([]);
  const register = useCallback((el: HTMLElement) => setStack((s) => [...s, el]), []);
  const unregister = useCallback(
    (el: HTMLElement) => setStack((s) => s.filter((x) => x !== el)),
    []
  );
  const value = useMemo(
    () => ({ element: stack.at(-1) ?? null, register, unregister }),
    [stack, register, unregister]
  );
  return <PageHeaderSlotContext.Provider value={value}>{children}</PageHeaderSlotContext.Provider>;
}
