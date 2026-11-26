import { overageOf, RESOURCES, usedOf, type Resource } from '../makeItFit';
import type { FittingStats } from '../types';

export const overrunBy = (seed: FittingStats): Resource[] =>
  RESOURCES.filter((r) => overageOf(seed, r) > 0);

export const freedBy = (from: FittingStats, to: FittingStats): Record<Resource, number> =>
  Object.fromEntries(RESOURCES.map((r) => [r, usedOf(from, r) - usedOf(to, r)])) as Record<
    Resource,
    number
  >;

export function coveringFreed(
  seed: FittingStats,
  freed: Readonly<Record<Resource, number>>
): number | null {
  const over = overrunBy(seed);
  if (!over.every((r) => freed[r] >= overageOf(seed, r))) return null;
  return over.reduce((sum, r) => sum + freed[r], 0);
}
