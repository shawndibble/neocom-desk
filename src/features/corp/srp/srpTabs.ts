import { definePageTabs } from '@/lib/pageTabs';

/**
 * `/corp/srp`'s tabs (ADR 0015), in bar order; the first is where the bare path lands. A tab
 * exists here for every view in `srpViews.ts`. Which of them a pilot sees is the views'
 * `visible` rules, not this list: an officer lands on the Queue, or on Settings where SRP is off.
 * The player's own view (file a claim, My claims) is `/srp`, a sub-view of the Overview.
 */
export const SRP_TABS = definePageTabs('/corp/srp', [
  { id: 'queue', labelKey: 'srp.tabs.queue' },
  { id: 'settings', labelKey: 'srp.tabs.settings' },
]);

export type SrpTabId = (typeof SRP_TABS.tabs)[number]['id'];
