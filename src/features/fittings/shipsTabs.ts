/**
 * The Ships section's tabs (ADR 0015, scope decision `20260926-135538`):
 * Fittings — the library a Fitting is opened from — and the Ship Tree.
 *
 * `fittings/edit` is the Fitting editor. It is not a tab in the bar but a
 * `standalone` page below the Fittings tab, declared here rather than as its
 * own route so the editor and the library stay one mounted `Fittings`
 * instance: `useFittingWorkspace` carries what an open started (a saved
 * Fitting's name and record, a Load's warnings, its drone launch) across the
 * navigation from `/ships/fittings` into `/ships/fittings/edit`. Compare
 * shares no state with either, so it is an ordinary nested route
 * (`/ships/fittings/compare`, `App.tsx`).
 */
import { definePageTabs } from '@/lib/pageTabs';

export type ShipsTab = 'fittings' | 'tree' | 'fittings/edit';

export const SHIPS_TABS = definePageTabs<ShipsTab>('/ships', [
  { id: 'fittings', labelKey: 'ships.tabs.fittings' },
  { id: 'tree', labelKey: 'ships.tabs.tree' },
  { id: 'fittings/edit', labelKey: 'fittings.editTitle', standalone: true },
]);

/** The Ships tab bar's `tabsId`: one bar per page, so its panels (in other components) can name it. */
export const SHIPS_TABS_ID = 'ships-tabs';
