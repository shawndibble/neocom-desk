/**
 * Whether a Payee is archived (GLOSSARY.md, Archived Payee): the pilot's "I don't want to see them
 * any more", even with credit. It is a reading of what is stored, never a write, so no device can
 * race another: the stored `archivedAt` hides a Payee only while nothing is owed and none of its
 * Assignments was billed or changed since (by when it was written, never by the day it was mined,
 * so a backfilled or same-day entry shows it again). Anything new, or owed, shows it again.
 * Pure.
 */
export function isArchivedPayee(
  archivedAt: number | undefined,
  owes: { amount: number } | null,
  /** The Payee's billed Assignments, each as last written (`updatedAt`, epoch ms). */
  assignments: readonly { updatedAt: number }[]
): boolean {
  if (archivedAt === undefined || owes !== null) return false;
  return assignments.every((a) => a.updatedAt <= archivedAt);
}
