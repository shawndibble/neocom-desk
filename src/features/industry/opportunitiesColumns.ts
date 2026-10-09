import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

/**
 * The Build Opportunities table's optional columns, in table order. Product,
 * the margin and stock figures, ISK/hour and the PLAN button always show.
 * Blueprint, Time and Depth start unticked: at 1024px the table otherwise
 * scrolls sideways, hiding Depth and the row menu, and wraps its cells.
 */
export const OPPORTUNITIES_COLUMN_IDS = ['blueprint', 'duration', 'orderDepth'] as const;
export type OpportunitiesColumnId = (typeof OPPORTUNITIES_COLUMN_IDS)[number];
export const OPPORTUNITIES_DEFAULT_COLUMNS: readonly OpportunitiesColumnId[] = [];
export const useVisibleOpportunitiesColumns = createColumnVisibilitySetting({
  key: 'opportunitiesVisibleColumns',
  ids: OPPORTUNITIES_COLUMN_IDS,
  defaultVisible: OPPORTUNITIES_DEFAULT_COLUMNS,
});
