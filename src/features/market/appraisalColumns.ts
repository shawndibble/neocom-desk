/**
 * The Appraisal result table's optional-column catalog and its device-local
 * visible-columns preference — the `bpcSearchColumns.ts` pattern.
 *
 * Quantity and Item are not here: the ledger can never lose the count or the
 * name it is a ledger of, so neither is optional.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

/** In table column order — `AppraisalPanel.tsx` pushes each id's column in this sequence when both applicable (Refine/LP store only exist once a row has one) and visible. */
export const APPRAISAL_COLUMN_IDS = [
  'buyEach',
  'sellEach',
  'splitEach',
  'buyTotal',
  'sellTotal',
  'refineTotal',
  'lpTotal',
  'volume',
  'iskPerM3',
  'salesTax',
  'brokerFee',
  'sellAfterFees',
] as const;

export type AppraisalColumnId = (typeof APPRAISAL_COLUMN_IDS)[number];

/** Columns added after the table shipped: there to tick in the picker, not on screen by default. */
const OFF_BY_DEFAULT: readonly AppraisalColumnId[] = [
  'splitEach',
  'iskPerM3',
  'salesTax',
  'brokerFee',
  'sellAfterFees',
];

/** Every column shown before the opt-in ones existed, so adding one changes nothing on its own. */
export const DEFAULT_VISIBLE_APPRAISAL_COLUMNS: readonly AppraisalColumnId[] =
  APPRAISAL_COLUMN_IDS.filter((id) => !OFF_BY_DEFAULT.includes(id));

export const VISIBLE_APPRAISAL_COLUMNS_KEY = 'appraisalVisibleColumns';

export const useVisibleAppraisalColumns = createColumnVisibilitySetting({
  key: VISIBLE_APPRAISAL_COLUMNS_KEY,
  ids: APPRAISAL_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_APPRAISAL_COLUMNS,
  // Empty stays valid: Quantity and Item always remain.
  allowEmpty: true,
});
