import type { DisplayRow } from './groupRows';

export function duplicateRowToOpen(
  duplicateAssignmentIds: readonly string[] | undefined,
  displayRows: readonly DisplayRow[]
): DisplayRow | undefined {
  const rows = (duplicateAssignmentIds ?? [])
    .map((id) => displayRows.find((dr) => dr.key === id))
    .filter((dr): dr is DisplayRow => dr !== undefined && dr.groupMembers === undefined);
  return rows.at(-1);
}
