import { definePageTabs } from '@/lib/pageTabs';

export type ShipsTab = 'fittings' | 'tree' | 'fittings/edit';

export const SHIPS_TABS = definePageTabs<ShipsTab>('/ships', [
  { id: 'fittings', labelKey: 'ships.tabs.fittings' },
  { id: 'tree', labelKey: 'ships.tabs.tree' },
  { id: 'fittings/edit', labelKey: 'fittings.editTitle', standalone: true },
]);

export const SHIPS_TABS_ID = 'ships-tabs';
