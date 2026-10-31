/**
 * The Tax ledger's optional columns and device-local visible-columns
 * preference, shared by the Open and History tables so the two stay lined up.
 * `date` is not one of these ids: it names the row, so it always shows.
 *
 * Whether a column is on offer at all (Character with one pilot, Ore and
 * Value by width) is the page's call; this is only what the pilot ticked.
 */
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
});
