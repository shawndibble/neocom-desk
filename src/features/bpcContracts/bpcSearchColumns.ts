import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const BPC_SEARCH_COLUMN_IDS = [
  'source',
  'location',
  'jumps',
  'me',
  'te',
  'runs',
  'qty',
  'iskPerRun',
  'vsPeers',
  'price',
  'region',
  'space',
  'expires',
] as const;

export type BpcSearchColumnId = (typeof BPC_SEARCH_COLUMN_IDS)[number];

export const DEFAULT_VISIBLE_BPC_SEARCH_COLUMNS: readonly BpcSearchColumnId[] = [
  'location',
  'jumps',
  'me',
  'te',
  'price',
];

export const VISIBLE_BPC_SEARCH_COLUMNS_KEY = 'bpcSearchVisibleColumns.v2';

export const useVisibleBpcSearchColumns = createColumnVisibilitySetting({
  key: VISIBLE_BPC_SEARCH_COLUMNS_KEY,
  ids: BPC_SEARCH_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_BPC_SEARCH_COLUMNS,
  allowEmpty: true,
});
