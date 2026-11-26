import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const MARKET_WIDE_COLUMN_IDS = [
  'blueprintSource',
  'margin',
  'vs90d',
  'duration',
  'buildCost',
  'orderDepth',
] as const;
export type MarketWideColumnId = (typeof MARKET_WIDE_COLUMN_IDS)[number];
export const MARKET_WIDE_DEFAULT_COLUMNS: readonly MarketWideColumnId[] = ['margin', 'buildCost'];
export const useVisibleMarketWideColumns = createColumnVisibilitySetting({
  key: 'marketWideVisibleColumns',
  ids: MARKET_WIDE_COLUMN_IDS,
  defaultVisible: MARKET_WIDE_DEFAULT_COLUMNS,
});
