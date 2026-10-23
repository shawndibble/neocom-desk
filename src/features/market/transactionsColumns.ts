/**
 * The Market Transactions table's optional columns and device-local
 * visible-columns preference. `item` is not in the catalog (it is what each
 * fill is, the one column the table can never lose), and neither is
 * `character`, which only exists to say whose fill a row is under All.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const TRANSACTIONS_COLUMN_IDS = [
  'date',
  'side',
  'quantity',
  'unitPrice',
  'total',
  'margin',
  'marginPercent',
  'unitCost',
  'location',
] as const;

export type TransactionsColumnId = (typeof TRANSACTIONS_COLUMN_IDS)[number];

/**
 * The derived columns (Margin, Margin %, Unit cost) start unticked: they lean
 * on the wallet journal and the FIFO walk (and say "no buy" or "outside" where
 * they can't be worked), so the table opens on what ESI recorded and a pilot
 * opts in to the estimate. Location starts unticked too, since naming a
 * player structure is a lookup per place.
 */
export const DEFAULT_VISIBLE_TRANSACTIONS_COLUMNS: readonly TransactionsColumnId[] = [
  'date',
  'side',
  'quantity',
  'unitPrice',
  'total',
];

/** Off by default on a phone; ticking them shows them. */
export const TRANSACTIONS_PHONE_OFF_BY_DEFAULT: readonly TransactionsColumnId[] = ['side'];

export const useVisibleTransactionsColumns = createColumnVisibilitySetting({
  key: 'marketTransactionsVisibleColumns',
  ids: TRANSACTIONS_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_TRANSACTIONS_COLUMNS,
});
