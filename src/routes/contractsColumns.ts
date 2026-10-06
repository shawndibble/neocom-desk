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
  'receiver',
  'price',
  'issued',
  'expires',
] as const;
export type ContractsHistoryColumnId = (typeof CONTRACTS_HISTORY_COLUMN_IDS)[number];

export const contractsHistoryColumnsStore = createColumnVisibilitySetting({
  // `.v3`: a stored pre-Receiver list would otherwise hide the new column.
  key: 'contractsHistoryVisibleColumns.v3',
  ids: CONTRACTS_HISTORY_COLUMN_IDS,
});
