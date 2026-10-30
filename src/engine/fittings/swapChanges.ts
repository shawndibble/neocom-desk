/**
 * Everything a module swap changes, at the rounding each is shown at: the
 * stats-panel fields (`diffFittingStats`) and the role figures (`skillGains`:
 * weapon reach, mining yield, a hauler's hold, remote repair, bursts). One
 * list, so the Variations table and Improve's Gives up name the same things.
 */
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
