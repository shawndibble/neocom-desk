/**
 * The Requests board's optional columns and device-local visible-columns
 * preference. `request` is not in the catalog: it names each row, and the
 * table can never lose it.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const REQUEST_COLUMN_IDS = ['terms', 'progress', 'status', 'age'] as const;

export type RequestColumnId = (typeof REQUEST_COLUMN_IDS)[number];

export const useVisibleRequestColumns = createColumnVisibilitySetting({
  key: 'communityRequestsVisibleColumns',
  ids: REQUEST_COLUMN_IDS,
});
