import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const STOCK_MARKET_COLUMN_IDS = [
  'items',
  'out',
  'low',
  'ready',
  'toSource',
  'need',
] as const;

export type StockMarketColumnId = (typeof STOCK_MARKET_COLUMN_IDS)[number];

export const useVisibleStockMarketColumns = createColumnVisibilitySetting({
  key: 'stockMarketsVisibleColumns',
  ids: STOCK_MARKET_COLUMN_IDS,
});
