/**
 * Open Orders' optional-column catalog and device-local visible-columns
 * preference (`columnVisibility.ts`) — one setting shared by every
 * per-problem-group table on the page, since they all render the same column
 * set. `item` (the row's identity) and `details` (the button that opens the
 * modal) are not here: neither is ever optional.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const OPEN_ORDER_COLUMN_IDS = [
  'where',
  'price',
  'problem',
  'floor',
  'remaining',
  'expires',
] as const;

export type OpenOrderColumnId = (typeof OPEN_ORDER_COLUMN_IDS)[number];

export const useVisibleOpenOrderColumns = createColumnVisibilitySetting({
  key: 'openOrdersVisibleColumns',
  ids: OPEN_ORDER_COLUMN_IDS,
});
