import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CONTRACT_SEARCH_ITEMS_COLUMN_IDS = [
  'qty',
  'iskPerUnit',
  'price',
  'saving',
  'system',
  'jumps',
  'region',
  'expires',
] as const;

export type ContractSearchItemsColumnId = (typeof CONTRACT_SEARCH_ITEMS_COLUMN_IDS)[number];

export const DEFAULT_VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS: readonly ContractSearchItemsColumnId[] =
  CONTRACT_SEARCH_ITEMS_COLUMN_IDS;

export const VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS_KEY = 'contractSearchItemsVisibleColumns';

export const useVisibleContractSearchItemsColumns = createColumnVisibilitySetting({
  key: VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS_KEY,
  ids: CONTRACT_SEARCH_ITEMS_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS,
});
