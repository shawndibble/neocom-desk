/**
 * The Manager table's optional columns and their device-local visible-columns
 * preference. `item` and the row-select box are not in the catalog: the item
 * names each row, and the table can never lose it.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const STOCK_COLUMN_IDS = [
  'target',
  'listed',
  'inHangar',
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
