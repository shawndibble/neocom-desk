import { definePageTabs } from '@/lib/pageTabs';

export const SRP_TABS = definePageTabs('/corp/srp', [
  { id: 'queue', labelKey: 'srp.tabs.queue' },
  { id: 'settings', labelKey: 'srp.tabs.settings' },
]);

export type SrpTabId = (typeof SRP_TABS.tabs)[number]['id'];
