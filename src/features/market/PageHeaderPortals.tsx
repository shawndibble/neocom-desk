import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PageHeaderClusterContext } from '@/components/ui/pageHeaderCluster';
import type { PageHeaderSlots } from './pageHeaderSlots';

interface PageHeaderPortalsProps {
  slots: PageHeaderSlots;
  meta?: ReactNode;
  scope?: ReactNode;
  actions?: ReactNode;
}

export function PageHeaderPortals({ slots, meta, scope, actions }: PageHeaderPortalsProps) {
  return (
    <>
      {slots.meta && meta ? createPortal(meta, slots.meta) : null}
      {slots.scope && scope
        ? createPortal(
            <PageHeaderClusterContext.Provider value={true}>
              {scope}
            </PageHeaderClusterContext.Provider>,
            slots.scope
          )
        : null}
      {slots.actions && actions ? createPortal(actions, slots.actions) : null}
    </>
  );
}
