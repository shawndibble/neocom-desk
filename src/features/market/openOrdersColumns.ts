/**
 * Open Orders' optional-column catalog and device-local visible-columns
 * preference (`columnVisibility.ts`). The fix list's four columns (Item,
 * What's wrong, Do this, ISK tied up) are always on and not here; these five
 * sit between Do this and ISK tied up when the Columns menu turns them on,
 * and are all off until it does.
 *
 * A new key, not the grouped page's `openOrdersVisibleColumns`: a pick saved
 * there (say price, floor, remaining, expires) is valid under these ids and
 * would switch four of them on for a pilot who never chose them here.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const OPEN_ORDER_COLUMN_IDS = [
  'price',
  'stationCheapest',
  'floor',
  'remaining',
  'expires',
] as const;

export type OpenOrderColumnId = (typeof OPEN_ORDER_COLUMN_IDS)[number];

export const OPEN_ORDER_DEFAULT_COLUMNS: readonly OpenOrderColumnId[] = [];

export const useVisibleOpenOrderColumns = createColumnVisibilitySetting({
  key: 'openOrdersOptionalColumns',
  ids: OPEN_ORDER_COLUMN_IDS,
  defaultVisible: OPEN_ORDER_DEFAULT_COLUMNS,
});
