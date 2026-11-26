import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const REQUEST_COLUMN_IDS = ['terms', 'progress', 'status', 'age'] as const;

export type RequestColumnId = (typeof REQUEST_COLUMN_IDS)[number];

export const useVisibleRequestColumns = createColumnVisibilitySetting({
  key: 'communityRequestsVisibleColumns',
  ids: REQUEST_COLUMN_IDS,
});
