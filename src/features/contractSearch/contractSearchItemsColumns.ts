/**
 * Contract Search's Items board — optional-column catalog and device-local
 * visible-columns preference, the `bpcSearchColumns.ts` pattern applied here.
 * `item` is not in the catalog: like BPC Search's own identity column, it is
 * the one column `ContractSearchPanel.tsx`'s table can never lose.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CONTRACT_SEARCH_ITEMS_COLUMN_IDS = [
  'qty',
  'iskPerUnit',
  'price',
  'system',
  'jumps',
  'region',
  'expires',
] as const;

export type ContractSearchItemsColumnId = (typeof CONTRACT_SEARCH_ITEMS_COLUMN_IDS)[number];

/** Every column is on by default, ISK/unit included (it sits beside Qty, which is on). */
export const DEFAULT_VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS: readonly ContractSearchItemsColumnId[] =
  CONTRACT_SEARCH_ITEMS_COLUMN_IDS;

export const VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS_KEY = 'contractSearchItemsVisibleColumns';

export const useVisibleContractSearchItemsColumns = createColumnVisibilitySetting({
  key: VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS_KEY,
  ids: CONTRACT_SEARCH_ITEMS_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS,
});
