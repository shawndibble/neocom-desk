import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const STOCK_COLUMN_IDS = [
  'target',
  'listed',
  'inHangar',
  'inJobs',
  'fill',
  'restock',
  'cost',
  'status',
] as const;

export type StockColumnId = (typeof STOCK_COLUMN_IDS)[number];

export const useVisibleStockColumns = createColumnVisibilitySetting({
  key: 'stockVisibleColumns',
  ids: STOCK_COLUMN_IDS,
});
