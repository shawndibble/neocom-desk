/**
 * Contracts route — the History table's optional-column catalog and
 * device-local visible-columns preference, the `createColumnVisibilitySetting`
 * pattern (`src/lib/columnVisibility.ts`). `type` is the table's identity
 * column (it opens the detail modal) and never appears here.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CONTRACTS_HISTORY_COLUMN_IDS = [
  'status',
  'issuer',
  'price',
  'issued',
  'expires',
] as const;
export type ContractsHistoryColumnId = (typeof CONTRACTS_HISTORY_COLUMN_IDS)[number];

export const contractsHistoryColumnsStore = createColumnVisibilitySetting({
  // `.v2`: a stored pre-Issued list would otherwise hide the new column.
  key: 'contractsHistoryVisibleColumns.v2',
  ids: CONTRACTS_HISTORY_COLUMN_IDS,
});
