import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const TAX_COLUMN_IDS = [
  'character',
  'system',
  'payee',
  'ore',
  'value',
  'taxOwed',
  'status',
] as const;

export type TaxColumnId = (typeof TAX_COLUMN_IDS)[number];

export const useVisibleTaxColumns = createColumnVisibilitySetting({
  key: 'miningTaxLedgerVisibleColumns',
  ids: TAX_COLUMN_IDS,
  allowEmpty: true,
});
