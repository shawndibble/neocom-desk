/**
 * Lawless (insurgency) systems on a route (issue #2870): which stored ids may
 * still be shown. The lawless-systems job checks the list every 15
 * minutes (the R2 copy is rewritten each run; the `syncLawlessSystems` Firestore
 * fallback re-confirms an unchanged list every 30, issue #4272), so `updatedAt` means "last confirmed"; past
 * `LAWLESS_STALE_AFTER_MS` the list is not shown at all — a stale list must
 * never read as current.
 */

export const LAWLESS_STALE_AFTER_MS = 60 * 60 * 1000;
/** A client clock this far behind the function's still reads a just-written list. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

const NONE: ReadonlySet<number> = new Set();

/** The stored ids when the snapshot is present, well-formed and fresh enough to show, else null. */
export function parseFreshLawless(doc: unknown, now: number): number[] | null {
  if (typeof doc !== 'object' || doc === null) return null;
  const { systemIds, updatedAt } = doc as { systemIds?: unknown; updatedAt?: unknown };
  if (!Array.isArray(systemIds) || typeof updatedAt !== 'number') return null;
  const age = now - updatedAt;
  if (age < -CLOCK_SKEW_MS || age > LAWLESS_STALE_AFTER_MS) return null;
  return systemIds.filter((id): id is number => Number.isInteger(id));
}

/** The lawless system ids to show, or none when the snapshot is missing, malformed or stale. */
export function freshLawlessSystems(doc: unknown, now: number): ReadonlySet<number> {
  const ids = parseFreshLawless(doc, now);
  return ids === null ? NONE : new Set(ids);
}
