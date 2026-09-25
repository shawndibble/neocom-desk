/**
 * Corp Transactions' optional columns and device-local visible-columns
 * preference. `item` is not in the catalog: it is what each fill is, and the
 * one column the table can never lose.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CORP_TRANSACTIONS_COLUMN_IDS = [
  'date',
  'side',
  'quantity',
  'unitPrice',
  'total',
] as const;

export type CorpTransactionsColumnId = (typeof CORP_TRANSACTIONS_COLUMN_IDS)[number];

export const useVisibleCorpTransactionsColumns = createColumnVisibilitySetting({
  key: 'corpTransactionsVisibleColumns',
  ids: CORP_TRANSACTIONS_COLUMN_IDS,
});
