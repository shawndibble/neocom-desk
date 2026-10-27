import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PageHeaderClusterContext } from '@/components/ui/pageHeaderCluster';
import type { PageHeaderSlots } from './pageHeaderSlots';

interface PageHeaderPortalsProps {
  slots: PageHeaderSlots;
  meta?: ReactNode;
  /** The tab's `CharacterFilterControl`, portalled into `PageHeader`'s `scope` slot. */
  scope?: ReactNode;
  actions?: ReactNode;
}

export function PageHeaderPortals({ slots, meta, scope, actions }: PageHeaderPortalsProps) {
  return (
    <>
      {slots.meta && meta ? createPortal(meta, slots.meta) : null}
      {/* A portal keeps the context of where it is rendered, not of its DOM
          target, so the header's touch tier is provided again here. */}
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
