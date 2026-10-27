import type { ReactNode } from 'react';
import { usePageHeaderSlots, type PageHeaderSlots } from '../pageHeaderSlots';

/** Stands in for Market's `PageHeader`: the slots a tab panel portals into, inside a `banner`. */
export function WithPageHeaderSlots({
  children,
}: {
  children: (slots: PageHeaderSlots) => ReactNode;
}) {
  const { slots, metaSlot, scopeSlot, actionsSlot } = usePageHeaderSlots();
  return (
    <>
      <header>
        {metaSlot}
        {scopeSlot}
        {actionsSlot}
      </header>
      {children(slots)}
    </>
  );
}
