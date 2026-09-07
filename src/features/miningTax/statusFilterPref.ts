/**
 * The Moon Mining ledger's Status filter, remembered across visits.
 *
 * Silent page state, not a Settings control: the filter's own dropdown is on
 * screen whenever it applies, and a second copy on the Settings page would be
 * a place that could drift from what the control itself shows.
 *
 * It earns persistence because it *hides rows*. Forgetting it puts a pilot who
 * works from the Paid list back on the default three every time, with no sign
 * that anything is missing — unlike a sort order, where the same rows are
 * simply arranged differently.
 *
 * One wrinkle worth naming: `DEFAULT_STATUSES` leaves Paid and Dismissed out
 * because both are "handled, opt-in to view". Persisting means that opt-in
 * becomes permanent once made — a real change to what that default means, and
 * the reason the pilot can always see which statuses are selected on the
 * control itself.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { STATUS_LABEL_KEY, type MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';

export const STATUS_FILTER_SETTING_KEY = 'miningTaxStatusFilter';

/** Everything except Paid and Dismissed — both are "handled", opt-in to view (decision doc's Paid precedent). */
export const DEFAULT_STATUS_FILTER: readonly MiningTaxRowStatus[] = [
  'unassigned',
  'needs-review',
  'outstanding',
];

// Derived from the label map rather than a second list: that Record is keyed
// by every status, so a new one cannot be added without appearing here too.
function isRowStatus(raw: unknown): raw is MiningTaxRowStatus {
  return typeof raw === 'string' && Object.hasOwn(STATUS_LABEL_KEY, raw);
}

export const useStatusFilter = createLocalSetting<readonly MiningTaxRowStatus[]>({
  key: STATUS_FILTER_SETTING_KEY,
  defaultValue: DEFAULT_STATUS_FILTER,
  // An array, not a Set: Dexie stores plain structured-cloneable values, and a
  // Set round-trips as one only by accident of the driver. Rebuilt into a Set
  // at the point of use.
  //
  // An empty stored array is rejected rather than honoured — it would render
  // an empty table with no rows and no explanation, and the control reads
  // "0 selected", which is the state `toggleFilterMember` already refuses to
  // produce.
  parse: (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw.every(isRowStatus) ? (raw as MiningTaxRowStatus[]) : null;
  },
});
