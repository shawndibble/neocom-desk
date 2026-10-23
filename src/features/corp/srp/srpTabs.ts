import { definePageTabs } from '@/lib/pageTabs';

/**
 * `/corp/srp`'s tabs (ADR 0015), in bar order; the first is where the bare path lands. A tab
 * exists here for every view in `srpViews.ts` (the officer queue, #4853, adds its own). Which
 * of them a pilot sees is the views' `visible` rules, not this list.
 */
export const SRP_TABS = definePageTabs('/corp/srp', [
  { id: 'claims', labelKey: 'srp.tabs.claims' },
  { id: 'settings', labelKey: 'srp.tabs.settings' },
]);

export type SrpTabId = (typeof SRP_TABS.tabs)[number]['id'];
