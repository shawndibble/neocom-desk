import type { ReactNode } from 'react';
import { usePageHeaderSlots, type PageHeaderSlots } from '../pageHeaderSlots';

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
