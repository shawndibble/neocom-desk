import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const OPPORTUNITIES_COLUMN_IDS = ['blueprint', 'duration', 'orderDepth'] as const;
export type OpportunitiesColumnId = (typeof OPPORTUNITIES_COLUMN_IDS)[number];
export const OPPORTUNITIES_DEFAULT_COLUMNS: readonly OpportunitiesColumnId[] = [];
export const useVisibleOpportunitiesColumns = createColumnVisibilitySetting({
  key: 'opportunitiesVisibleColumns',
  ids: OPPORTUNITIES_COLUMN_IDS,
  defaultVisible: OPPORTUNITIES_DEFAULT_COLUMNS,
});
