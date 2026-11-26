import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CONTRACTS_HISTORY_COLUMN_IDS = [
  'type',
  'status',
  'issuer',
  'receiver',
  'price',
  'issued',
  'expires',
] as const;
export type ContractsHistoryColumnId = (typeof CONTRACTS_HISTORY_COLUMN_IDS)[number];

export const contractsHistoryColumnsStore = createColumnVisibilitySetting({
  key: 'contractsHistoryVisibleColumns.v4',
  ids: CONTRACTS_HISTORY_COLUMN_IDS,
});
