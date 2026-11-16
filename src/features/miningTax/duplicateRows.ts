import type { DisplayRow } from './groupRows';

/**
 * The row to open when the member drops a day's extra Assignment (#6279 follow-up).
 *
 * `findDuplicateAssignmentIds` returns every member of an identical set, never "the extra one":
 * they match on Payee, rate and ore lines, so there is nothing to tell them apart and dropping
 * any one of them leaves the day correctly assigned once. The last that still has a row is
 * taken because the set is unordered — and a set whose rows have all been folded into a
 * Combined Entry resolves to that entry's own row, which is still the right day to open.
 *
 * Undefined when no listed Assignment has a row in view (a Character filter hiding it, say):
 * the caller then lists the day as plain text rather than offering a button that does nothing.
 */
export function extraDuplicateRow(
  duplicateAssignmentIds: readonly string[] | undefined,
  displayRows: readonly DisplayRow[]
): DisplayRow | undefined {
  const rows = (duplicateAssignmentIds ?? [])
    .map((id) => displayRows.find((dr) => dr.key === id))
    .filter((dr): dr is DisplayRow => dr !== undefined);
  return rows.at(-1);
}
