/**
 * Whether a Payee is archived (GLOSSARY.md, Archived Payee): the pilot's "I don't want to see them
 * any more", even with credit. It is a reading of what is stored, never a write, so no device can
 * race another: the stored `archivedAt` hides a Payee only while nothing is owed and nothing was
 * billed to it on a UTC day after the one it was archived. Anything new, or owed, shows it again.
 * Pure.
 */
import { utcDayOf } from '../localDay';

export function isArchivedPayee(
  archivedAt: number | undefined,
  owes: { amount: number } | null,
  charges: readonly { date: string }[]
): boolean {
  if (archivedAt === undefined || owes !== null) return false;
  const day = utcDayOf(new Date(archivedAt).toISOString());
  return charges.every((c) => c.date <= day);
}
