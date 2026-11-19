import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { PageHeaderSlotContext } from './pageHeaderSlot';

/**
 * A spot in every `PageHeader`'s right-hand cluster, between its actions and the alerts bell, that
 * the shell fills by portal. A feature that lives for the whole session (the Corp Tax Book send
 * queue, which also does the sending) keeps running in the shell and draws only its chip here,
 * so the chip rides in the header on every page that has one.
 */
export function PageHeaderSlotProvider({ children }: { children: ReactNode }) {
  // A stack: with two headers on a page the newest owns the slot, and when it goes the one
  // under it takes the slot back.
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
