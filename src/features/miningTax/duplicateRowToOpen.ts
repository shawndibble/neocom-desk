import type { DisplayRow } from './groupRows';

/**
 * A row to open when the member drops one of a day's duplicate Assignments (#6279 follow-up).
 *
 * Deliberately not named for "the extra one": there is no such thing.
 *
 * `findDuplicateAssignmentIds` returns every member of an identical set, never "the extra one":
 * they match on Payee, rate and ore lines, so there is nothing to tell them apart and dropping
 * any one of them leaves the day correctly assigned once. The last that still has a row is
 * taken because the set is unordered — and a set whose rows have all been folded into a
 * Combined Entry resolves to that entry's own row, which is still the right day to open.
 *
 * A row that is a Combined Entry is refused: its key is only the primary Assignment's, and its
 * confirm unassigns every member of the join — more than "the extra one" the link offers to
 * drop. Those days stay plain text until the member splits the join.
 *
 * Undefined when no listed Assignment has a row in view (a Character filter hiding it, say):
 * the caller then lists the day as plain text rather than offering a button that does nothing.
 */
export function duplicateRowToOpen(
  duplicateAssignmentIds: readonly string[] | undefined,
  displayRows: readonly DisplayRow[]
): DisplayRow | undefined {
  const rows = (duplicateAssignmentIds ?? [])
    .map((id) => displayRows.find((dr) => dr.key === id))
    .filter((dr): dr is DisplayRow => dr !== undefined && dr.groupMembers === undefined);
  return rows.at(-1);
}
