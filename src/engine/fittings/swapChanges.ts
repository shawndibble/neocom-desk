import { roleSwapChanges, type RoleChange } from './skillGains';
import { diffFittingStats, type StatChange } from './variationDelta';
import type { FittingStats } from './types';

export type SwapChange =
  { kind: 'stat'; change: StatChange } | { kind: 'role'; change: RoleChange };

export function swapChanges(before: FittingStats, after: FittingStats): SwapChange[] {
  return [
    ...diffFittingStats(before, after).changes.map((change): SwapChange => ({
      kind: 'stat',
      change,
    })),
    ...roleSwapChanges(before, after).map((change): SwapChange => ({ kind: 'role', change })),
  ];
}
