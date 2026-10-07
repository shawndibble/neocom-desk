/**
 * Lawless (insurgency) systems on a route (issue #2870): which stored ids may
 * still be shown. The `syncLawlessSystems` function refreshes the list about
 * every 10 minutes; past `LAWLESS_STALE_AFTER_MS` (six missed runs) the list
 * is not shown at all — a stale list must never read as current.
 */

export const LAWLESS_STALE_AFTER_MS = 60 * 60 * 1000;

const NONE: ReadonlySet<number> = new Set();

/** The lawless system ids to show, or none when the snapshot is missing, malformed or stale. */
export function freshLawlessSystems(doc: unknown, now: number): ReadonlySet<number> {
  if (typeof doc !== 'object' || doc === null) return NONE;
  const { systemIds, updatedAt } = doc as { systemIds?: unknown; updatedAt?: unknown };
  if (!Array.isArray(systemIds) || typeof updatedAt !== 'number') return NONE;
  const age = now - updatedAt;
  if (age < 0 || age > LAWLESS_STALE_AFTER_MS) return NONE;
  return new Set(systemIds.filter((id): id is number => Number.isInteger(id)));
}
