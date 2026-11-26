import { useMemo, useState } from 'react';

export interface PageHeaderSlots {
  meta: HTMLElement | null;
  scope: HTMLElement | null;
  actions: HTMLElement | null;
}

export function usePageHeaderSlots() {
  const [meta, setMeta] = useState<HTMLSpanElement | null>(null);
  const [scope, setScope] = useState<HTMLSpanElement | null>(null);
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  const slots = useMemo<PageHeaderSlots>(() => ({ meta, scope, actions }), [meta, scope, actions]);
  return {
    slots,
    metaSlot: <span ref={setMeta} className="contents" />,
    scopeSlot: <span ref={setScope} className="contents" />,
    actionsSlot: <div ref={setActions} className="flex items-center gap-1.5" />,
  };
}
