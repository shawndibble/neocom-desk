/**
 * The test both pair searches share (issue #5575): `findImprovements` and the
 * Makeover each take an add that gained but overran the fit's CPU or
 * powergrid (the seed) and look for a swap that frees what it needs. Which
 * seeds, which swaps and how a pair is ranked differ (single swaps by score
 * and freed resources there; moves by gain and a recorded estimate here), so
 * only "does this swap free enough" is common.
 */
import { overageOf, RESOURCES, usedOf, type Resource } from './makeItFit';
import type { FittingStats } from './types';

/** What `seed` is over by: the resources it overruns. */
export const overrunBy = (seed: FittingStats): Resource[] =>
  RESOURCES.filter((r) => overageOf(seed, r) > 0);

/** What a change frees on each resource: the fit it started from, less the fit it made. */
export const freedBy = (from: FittingStats, to: FittingStats): Record<Resource, number> =>
  Object.fromEntries(RESOURCES.map((r) => [r, usedOf(from, r) - usedOf(to, r)])) as Record<
    Resource,
    number
  >;

/** The resources freed in all when `freed` covers every overrun of `seed`; null when it does not. */
export function coveringFreed(
  seed: FittingStats,
  freed: Readonly<Record<Resource, number>>
): number | null {
  const over = overrunBy(seed);
  if (!over.every((r) => freed[r] >= overageOf(seed, r))) return null;
  return over.reduce((sum, r) => sum + freed[r], 0);
}
