/**
 * Order History's optional-column catalog and device-local visible-columns
 * preference — the `columnVisibility.ts` helper applied to this table. `item`
 * is not here: it is the row's identity, so it is never optional.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const ORDER_HISTORY_COLUMN_IDS = ['side', 'price', 'remaining', 'issued', 'state'] as const;

export type OrderHistoryColumnId = (typeof ORDER_HISTORY_COLUMN_IDS)[number];

export const useVisibleOrderHistoryColumns = createColumnVisibilitySetting({
  key: 'orderHistoryVisibleColumns',
  ids: ORDER_HISTORY_COLUMN_IDS,
});
