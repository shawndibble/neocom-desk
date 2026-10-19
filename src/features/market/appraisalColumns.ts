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
  'buyTotal',
  'sellTotal',
  'refineTotal',
  'lpTotal',
  'volume',
  'iskPerM3',
] as const;

export type AppraisalColumnId = (typeof APPRAISAL_COLUMN_IDS)[number];

/**
 * Every column shown before ISK/m³ existed, so adding that one changes nothing
 * on its own: it is there to tick in the picker, not on screen by default.
 */
export const DEFAULT_VISIBLE_APPRAISAL_COLUMNS: readonly AppraisalColumnId[] =
  APPRAISAL_COLUMN_IDS.filter((id) => id !== 'iskPerM3');

export const VISIBLE_APPRAISAL_COLUMNS_KEY = 'appraisalVisibleColumns';

export const useVisibleAppraisalColumns = createColumnVisibilitySetting({
  key: VISIBLE_APPRAISAL_COLUMNS_KEY,
  ids: APPRAISAL_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_APPRAISAL_COLUMNS,
  // Empty stays valid: Quantity and Item always remain.
  allowEmpty: true,
});
