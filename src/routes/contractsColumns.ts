/**
 * Contracts route — the History table's optional-column catalog and
 * device-local visible-columns preference, the `createColumnVisibilitySetting`
 * pattern (`src/lib/columnVisibility.ts`). `type` is the table's identity
 * column (it opens the detail modal) and never appears here.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CONTRACTS_HISTORY_COLUMN_IDS = ['status', 'issuer', 'price', 'expires'] as const;
export type ContractsHistoryColumnId = (typeof CONTRACTS_HISTORY_COLUMN_IDS)[number];

export const contractsHistoryColumnsStore = createColumnVisibilitySetting({
  key: 'contractsHistoryVisibleColumns',
  ids: CONTRACTS_HISTORY_COLUMN_IDS,
});
