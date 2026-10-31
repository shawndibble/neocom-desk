/**
 * The Markets list's optional columns and device-local visible-columns
 * preference. `market` and the row caret are not in the catalog: the market
 * names each row, and the caret is what says the row opens.
 */
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
