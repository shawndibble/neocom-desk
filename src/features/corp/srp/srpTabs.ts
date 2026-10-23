import { definePageTabs } from '@/lib/pageTabs';

/**
 * `/corp/srp`'s tabs (ADR 0015), in bar order; the first is where the bare path lands. A tab
 * exists here for every view in `srpViews.ts`. Which of them a pilot sees is the views'
 * `visible` rules, not this list: a member lands on My claims, an officer on the Queue.
 */
export const SRP_TABS = definePageTabs('/corp/srp', [
  { id: 'queue', labelKey: 'srp.tabs.queue' },
  { id: 'claims', labelKey: 'srp.tabs.claims' },
  { id: 'settings', labelKey: 'srp.tabs.settings' },
]);

export type SrpTabId = (typeof SRP_TABS.tabs)[number]['id'];
