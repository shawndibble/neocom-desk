import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const OVERVIEW_COLUMN_IDS = [
  'character',
  'system',
  'volume',
  'rawValue',
  'total',
  'refineValue',
  'oreBreakdown',
  'units',
] as const;

export type OverviewColumnId = (typeof OVERVIEW_COLUMN_IDS)[number];

export const DEFAULT_VISIBLE_OVERVIEW_COLUMNS: readonly OverviewColumnId[] = [
  'character',
  'system',
  'volume',
  'rawValue',
  'refineValue',
];

export const VISIBLE_OVERVIEW_COLUMNS_KEY = 'miningYieldOverviewVisibleColumns';

export const useVisibleOverviewColumns = createColumnVisibilitySetting({
  key: VISIBLE_OVERVIEW_COLUMNS_KEY,
  ids: OVERVIEW_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_OVERVIEW_COLUMNS,
});

export function availableOverviewColumns(
  showRefining: boolean,
  showCharacterColumn: boolean
): readonly OverviewColumnId[] {
  return OVERVIEW_COLUMN_IDS.filter((id) => {
    if (id === 'refineValue' && !showRefining) return false;
    if (id === 'character' && !showCharacterColumn) return false;
    return true;
  });
}

export function visibleAvailableColumns(
  visible: readonly OverviewColumnId[],
  showRefining: boolean,
  showCharacterColumn: boolean
): readonly OverviewColumnId[] {
  const available = new Set(availableOverviewColumns(showRefining, showCharacterColumn));
  return visible.filter((id) => available.has(id));
}
