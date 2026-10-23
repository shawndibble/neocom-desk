/**
 * `/corp/srp`'s URLs (ADR 0015): the view is a path segment. The ids are the `SRP_VIEWS` ids; a
 * pilot who may not see a view lands on the first one they may (`SrpPage`), so a stale link
 * to Settings opens the queue for an Accountant.
 */
import { definePageTabs } from '@/lib/pageTabs';

export const SRP_TABS = definePageTabs('/corp/srp', [
  { id: 'queue', labelKey: 'srp.tabs.queue' },
  { id: 'settings', labelKey: 'srp.tabs.settings' },
]);
