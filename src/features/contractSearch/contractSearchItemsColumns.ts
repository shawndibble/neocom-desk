/**
 * Contract Search's Items board — optional-column catalog and device-local
 * visible-columns preference, the `bpcSearchColumns.ts` pattern applied here.
 * `item` is not in the catalog: like BPC Search's own identity column, it is
 * the one column `ContractSearchPanel.tsx`'s table can never lose.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const CONTRACT_SEARCH_ITEMS_COLUMN_IDS = [
  'qty',
  'price',
  'system',
  'jumps',
  'region',
  'expires',
] as const;

export type ContractSearchItemsColumnId = (typeof CONTRACT_SEARCH_ITEMS_COLUMN_IDS)[number];

/** Every column shown today, so shipping the picker changes nothing on its own. */
export const DEFAULT_VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS: readonly ContractSearchItemsColumnId[] =
  CONTRACT_SEARCH_ITEMS_COLUMN_IDS;

function isContractSearchItemsColumnId(raw: unknown): raw is ContractSearchItemsColumnId {
  return (
    typeof raw === 'string' && (CONTRACT_SEARCH_ITEMS_COLUMN_IDS as readonly string[]).includes(raw)
  );
}

export const VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS_KEY = 'contractSearchItemsVisibleColumns';

export const useVisibleContractSearchItemsColumns = createLocalSetting<
  readonly ContractSearchItemsColumnId[]
>({
  key: VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_CONTRACT_SEARCH_ITEMS_COLUMNS,
  parse: (raw) =>
    Array.isArray(raw) && raw.length > 0 && raw.every(isContractSearchItemsColumnId)
      ? (raw as ContractSearchItemsColumnId[])
      : null,
});
