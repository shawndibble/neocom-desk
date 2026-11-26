import { HOUR_MS, MINUTE_MS } from '@/lib/age';

export const LAWLESS_STALE_AFTER_MS = HOUR_MS;
const CLOCK_SKEW_MS = 5 * MINUTE_MS;

const NONE: ReadonlySet<number> = new Set();

export function parseFreshLawless(doc: unknown, now: number): number[] | null {
  if (typeof doc !== 'object' || doc === null) return null;
  const { systemIds, updatedAt } = doc as { systemIds?: unknown; updatedAt?: unknown };
  if (!Array.isArray(systemIds) || typeof updatedAt !== 'number') return null;
  const age = now - updatedAt;
  if (age < -CLOCK_SKEW_MS || age > LAWLESS_STALE_AFTER_MS) return null;
  return systemIds.filter((id): id is number => Number.isInteger(id));
}

export function freshLawlessSystems(doc: unknown, now: number): ReadonlySet<number> {
  const ids = parseFreshLawless(doc, now);
  return ids === null ? NONE : new Set(ids);
}
