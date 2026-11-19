import { useState, type ReactNode } from 'react';
import { PageHeaderSlotContext } from './pageHeaderSlot';

/**
 * A spot in every `PageHeader`'s right-hand cluster, between its actions and the alerts bell, that
 * the shell fills by portal. A feature that lives for the whole session (the Corp Tax Book send
 * queue, which also does the sending) keeps running in the shell and draws only its chip here,
 * so the chip rides in the header on every page that has one.
 */
export function PageHeaderSlotProvider({ children }: { children: ReactNode }) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return (
    <PageHeaderSlotContext.Provider value={{ element, setElement }}>
      {children}
    </PageHeaderSlotContext.Provider>
  );
}
