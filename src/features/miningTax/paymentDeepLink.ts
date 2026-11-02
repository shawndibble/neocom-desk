/**
 * The wallet journal → Moon Mining Tax link: a journal entry (or contract) a
 * pilot linked to a tax payment lists each entry it settled, and each link
 * opens that entry's detail on the Tax tab. The URL names the Assignment;
 * `findRowForEntry` resolves the Tax tab row that holds it.
 */
import { allMembers, type DisplayRow } from './groupRows';

/** `tax.`-scoped like the Tax tab's other params, which `usePageTab` carries across tabs. */
export const PAYMENT_ENTRY_PARAM = 'tax.entry';

export function miningTaxEntryHref(assignmentId: string): string {
  const params = new URLSearchParams({ [PAYMENT_ENTRY_PARAM]: assignmentId });
  return `/mining/tax?${params.toString()}`;
}

export function parseEntryParam(raw: string | null): string | null {
  return raw ? raw : null;
}

/** The row holding this Assignment: its own row, or the joined row it was combined into. */
export function findRowForEntry(
  rows: readonly DisplayRow[],
  assignmentId: string
): DisplayRow | null {
  return rows.find((dr) => allMembers(dr).some((m) => m.assignment.id === assignmentId)) ?? null;
}
