import { allMembers, type DisplayRow } from './groupRows';

export const PAYMENT_ENTRY_PARAM = 'tax.entry';

export function miningTaxEntryHref(assignmentId: string): string {
  const params = new URLSearchParams({ [PAYMENT_ENTRY_PARAM]: assignmentId });
  return `/mining/tax?${params.toString()}`;
}

export function findRowForEntry(
  rows: readonly DisplayRow[],
  assignmentId: string
): DisplayRow | null {
  return rows.find((dr) => allMembers(dr).some((m) => m.assignment.id === assignmentId)) ?? null;
}
