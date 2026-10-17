/**
 * Open Orders' optional-column catalog + device-local pref (`columnVisibility.ts`).
 * New key: picks saved under `openOrdersVisibleColumns` share these ids and
 * would switch columns on unasked.
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
