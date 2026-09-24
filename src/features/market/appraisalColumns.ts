/**
 * The Appraisal result table's optional-column catalog and its device-local
 * visible-columns preference — the `bpcSearchColumns.ts` pattern.
 *
 * Quantity and Item are not here: the ledger can never lose the count or the
 * name it is a ledger of, so neither is optional.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

/** In table column order — `AppraisalPanel.tsx` pushes each id's column in this sequence when both applicable (Refine/LP store only exist once a row has one) and visible. */
export const APPRAISAL_COLUMN_IDS = [
  'buyEach',
  'sellEach',
  'buyTotal',
  'sellTotal',
  'refineTotal',
  'lpTotal',
] as const;

export type AppraisalColumnId = (typeof APPRAISAL_COLUMN_IDS)[number];

/** Every column shown today, so shipping the picker changes nothing on its own. */
export const DEFAULT_VISIBLE_APPRAISAL_COLUMNS: readonly AppraisalColumnId[] = APPRAISAL_COLUMN_IDS;

function isAppraisalColumnId(raw: unknown): raw is AppraisalColumnId {
  return typeof raw === 'string' && (APPRAISAL_COLUMN_IDS as readonly string[]).includes(raw);
}

export const VISIBLE_APPRAISAL_COLUMNS_KEY = 'appraisalVisibleColumns';

export const useVisibleAppraisalColumns = createLocalSetting<readonly AppraisalColumnId[]>({
  key: VISIBLE_APPRAISAL_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_APPRAISAL_COLUMNS,
  parse: (raw) =>
    Array.isArray(raw) && raw.every(isAppraisalColumnId) ? (raw as AppraisalColumnId[]) : null,
});
