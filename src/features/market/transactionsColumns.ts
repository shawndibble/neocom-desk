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

export const DEFAULT_VISIBLE_TRANSACTIONS_COLUMNS: readonly TransactionsColumnId[] = [
  'date',
  'side',
  'quantity',
  'unitPrice',
  'total',
];

export const TRANSACTIONS_PHONE_OFF_BY_DEFAULT: readonly TransactionsColumnId[] = ['side'];

export const useVisibleTransactionsColumns = createColumnVisibilitySetting({
  key: 'marketTransactionsVisibleColumns',
  ids: TRANSACTIONS_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_TRANSACTIONS_COLUMNS,
});
