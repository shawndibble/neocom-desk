import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PageHeaderSlots } from './pageHeaderSlots';

interface PageHeaderPortalsProps {
  slots: PageHeaderSlots;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeaderPortals({ slots, meta, actions }: PageHeaderPortalsProps) {
  return (
    <>
      {slots.meta && meta ? createPortal(meta, slots.meta) : null}
      {slots.actions && actions ? createPortal(actions, slots.actions) : null}
    </>
  );
}
