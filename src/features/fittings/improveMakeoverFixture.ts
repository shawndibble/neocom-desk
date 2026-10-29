/** A small Makeover for the component test and the stories: the PvE Drake from #5548. */
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { ImproveCandidate } from '@/engine/fittings/improve';
import { moveKey } from '@/engine/fittings/improveKeys';
import type { Makeover } from '@/engine/fittings/improveMakeover';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';

const NAMES: Record<number, string> = {
  1422: 'Shield Power Relay II',
  2048: 'Damage Control II',
  22291: 'Ballistic Control System II',
  35790: 'Missile Guidance Computer II',
  2281: 'Multispectrum Shield Hardener II',
  31812: 'Medium Core Defense Field Purger II',
  31796: 'Medium Core Defense Field Extender II',
};
export const typeNameOf = (typeId: number) => NAMES[typeId] ?? `Type ${typeId}`;

const row = (
  fromTypeId: number,
  toTypeId: number,
  slot: FittingSlotKind,
  slotIndexes: number[]
): ImproveCandidate => ({
  fromTypeId,
  toTypeId,
  at: slotIndexes.map((slotIndex) => ({ slot, slotIndex })),
});

export const MAKEOVER_ROWS: ImproveCandidate[] = [
  row(1422, 2048, 'low', [0]),
  row(1422, 22291, 'low', [1]),
  row(35790, 2281, 'medium', [0]),
  row(31812, 31796, 'rig', [0, 1, 2]),
];
export const MAKEOVER_KEYS = MAKEOVER_ROWS.map((r) => moveKey(r));

const base = baseFittingStats();
export const BEFORE: FittingStats = {
  ...base,
  ehp: 55_500,
  cpuUsed: 598,
  cpuTotal: 625,
  powergridUsed: 972,
  powergridTotal: 1038,
  offense: { ...base.offense, dps: 734 },
  navigation: { ...base.navigation, maxVelocity: 188 },
  capacitor: { stable: true, stablePercentage: 60 },
};

export const MAKEOVER: Makeover = {
  rows: MAKEOVER_ROWS,
  fitting: {} as Fitting,
  after: {
    ...BEFORE,
    ehp: 135_600,
    cpuUsed: 623,
    powergridUsed: 1031,
    offense: { ...BEFORE.offense, dps: 814 },
    navigation: { ...BEFORE.navigation, maxVelocity: 444 },
  },
  score: 2.02,
  iskDelta: 80_000_000,
  lost: [],
};

const COSTS = [240_000, 1_180_000, 310_000, 78_600_000];
export const rowCostOf = (candidate: ImproveCandidate) =>
  COSTS[MAKEOVER_ROWS.findIndex((r) => moveKey(r) === moveKey(candidate))] ?? null;

export const SINGLE_GAINS: ReadonlyMap<string, number> = new Map(
  MAKEOVER_KEYS.map((key, i) => [key, [0.41, 0.12, 0.28, 0.56][i]!])
);
