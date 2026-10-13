import { useMemo, useState } from 'react';

/**
 * Live nodes inside Market's `PageHeader`. A character tab (Open orders,
 * History) portals its Refresh / export into `actions` and its data age into
 * `meta`, so they sit in the page's one header, beside the bell, rather than
 * in a title bar of the tab's own. Its data lives in the panel, which is why
 * the panel renders them and the route only owns where they land.
 */
export interface PageHeaderSlots {
  meta: HTMLElement | null;
  actions: HTMLElement | null;
}

/**
 * The two slot nodes plus the elements to mount them on. Callback refs held
 * in state, not plain refs: the portal needs the re-render a node arriving
 * causes, or it never finds its target (`SkillPlanEditor`'s precedent).
 */
export function usePageHeaderSlots() {
  const [meta, setMeta] = useState<HTMLSpanElement | null>(null);
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  const slots = useMemo<PageHeaderSlots>(() => ({ meta, actions }), [meta, actions]);
  return {
    slots,
    metaSlot: <span ref={setMeta} className="contents" />,
    actionsSlot: <div ref={setActions} className="flex items-center gap-1.5" />,
  };
}
