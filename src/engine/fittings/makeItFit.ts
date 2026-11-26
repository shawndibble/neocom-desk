import { swapModuleType } from './fittingEdit';
import { fitsResourceBudget, resourceOverage } from './skillGaps';
import type { Fitting, FittingSlotKind, FittingStats } from './types';

export interface FitSwap {
  slot: FittingSlotKind;
  slotIndex: number;
  fromTypeId: number;
  toTypeId: number;
}

export interface FitOption {
  swaps: FitSwap[];
  fitting: Fitting;
  after: FittingStats;
  iskDelta: number | null;
}

export interface FitSwapsResult {
  options: FitOption[];
  nothingFits: boolean;
}

export const STAT_TOLERANCE = 0.05;

export const PAIR_LIMIT = 40;

export type Resource = 'cpu' | 'powergrid' | 'calibration';
export const RESOURCES: readonly Resource[] = ['cpu', 'powergrid', 'calibration'];

export function usedOf(stats: FittingStats, resource: Resource): number {
  if (resource === 'cpu') return stats.cpuUsed;
  if (resource === 'powergrid') return stats.powergridUsed;
  return stats.calibrationUsed;
}

export function overageOf(stats: FittingStats, resource: Resource): number {
  if (resource === 'cpu') return resourceOverage(stats.cpuUsed, stats.cpuTotal);
  if (resource === 'powergrid') return resourceOverage(stats.powergridUsed, stats.powergridTotal);
  return resourceOverage(stats.calibrationUsed, stats.calibrationTotal);
}

function applySwaps(fitting: Fitting, swaps: readonly FitSwap[]): Fitting {
  return swaps.reduce(
    (current, swap) => swapModuleType(current, swap.slot, swap.slotIndex, swap.toTypeId),
    fitting
  );
}

function iskDeltaOf(
  swaps: readonly FitSwap[],
  priceOf: (typeId: number) => number | null
): number | null {
  let total = 0;
  for (const swap of swaps) {
    const to = priceOf(swap.toTypeId);
    const from = priceOf(swap.fromTypeId);
    if (to === null || from === null) return null;
    total += to - from;
  }
  return total;
}

function statLoss(before: FittingStats, after: FittingStats): number {
  const pairs: [number, number][] = [
    [before.offense.dps, after.offense.dps],
    [before.ehp, after.ehp],
    [before.navigation.maxVelocity, after.navigation.maxVelocity],
  ];
  return pairs.reduce((sum, [b, a]) => (b > 0 ? sum + Math.max(0, (b - a) / b) : sum), 0);
}

function offerKey(option: FitOption): string {
  const swaps = option.swaps
    .map((swap) => `${swap.slot}:${swap.fromTypeId}>${swap.toTypeId}`)
    .sort()
    .join('|');
  const { after } = option;
  const figures = [
    after.offense.dps,
    after.ehp,
    after.navigation.maxVelocity,
    after.cpuUsed,
    after.powergridUsed,
    after.calibrationUsed,
  ].join(',');
  return `${swaps}#${figures}`;
}

export function rankFitOptions(before: FittingStats, options: readonly FitOption[]): FitOption[] {
  const scored = options
    .map((option) => ({ option, loss: statLoss(before, option.after) }))
    .sort((a, b) => a.loss - b.loss);
  if (scored.length === 0) return [];
  const cutoff = scored[0].loss + STAT_TOLERANCE;
  const near = scored.filter((entry) => entry.loss <= cutoff);
  const far = scored.filter((entry) => entry.loss > cutoff);
  near.sort((a, b) => {
    const ai = a.option.iskDelta;
    const bi = b.option.iskDelta;
    if (ai === null && bi === null) return a.loss - b.loss;
    if (ai === null) return 1;
    if (bi === null) return -1;
    return ai - bi || a.loss - b.loss;
  });
  const seen = new Set<string>();
  return [...near, ...far]
    .map((entry) => entry.option)
    .filter((option) => {
      const key = offerKey(option);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export interface FindFitSwapsParams {
  fitting: Fitting;
  before: FittingStats;
  candidates: readonly FitSwap[];
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  yieldFn?: () => Promise<void>;
  isCancelled?: () => boolean;
  accepts?: (after: FittingStats) => boolean;
}

export async function findFitSwaps({
  fitting,
  before,
  candidates,
  stats,
  priceOf,
  yieldFn,
  isCancelled,
  accepts,
}: FindFitSwapsParams): Promise<FitSwapsResult> {
  const over = RESOURCES.filter((resource) => overageOf(before, resource) > 0);
  if (accepts) return findAcceptedSwaps();
  if (over.length === 0) return { options: [], nothingFits: false };

  async function evaluate(swaps: FitSwap[]): Promise<FitOption | null> {
    await yieldFn?.();
    if (isCancelled?.()) return null;
    try {
      const swapped = applySwaps(fitting, swaps);
      const after = await stats(swapped);
      return { swaps, fitting: swapped, after, iskDelta: iskDeltaOf(swaps, priceOf) };
    } catch {
      return null;
    }
  }

  async function findAcceptedSwaps(): Promise<FitSwapsResult> {
    if (over.length === 0 && accepts!(before)) return { options: [], nothingFits: false };
    const accepted: FitOption[] = [];
    for (const candidate of candidates) {
      const option = await evaluate([candidate]);
      if (isCancelled?.()) return { options: [], nothingFits: false };
      if (option && fitsResourceBudget(option.after) && accepts!(option.after)) {
        accepted.push(option);
      }
    }
    accepted.sort((a, b) => {
      if ((a.iskDelta === null) !== (b.iskDelta === null)) return a.iskDelta === null ? 1 : -1;
      return (a.iskDelta ?? 0) - (b.iskDelta ?? 0);
    });
    return { options: accepted, nothingFits: accepted.length === 0 };
  }

  const singles: FitOption[] = [];
  for (const candidate of candidates) {
    const option = await evaluate([candidate]);
    if (isCancelled?.()) return { options: [], nothingFits: false };
    if (option) singles.push(option);
  }

  const fitting1 = singles.filter((option) => fitsResourceBudget(option.after));
  if (fitting1.length > 0) {
    return { options: rankFitOptions(before, fitting1), nothingFits: false };
  }

  const freed = (option: FitOption, resource: Resource) =>
    usedOf(before, resource) - usedOf(option.after, resource);
  const pairs: { swaps: FitSwap[]; estimate: number }[] = [];
  for (let i = 0; i < singles.length; i++) {
    for (let j = i + 1; j < singles.length; j++) {
      const a = singles[i];
      const b = singles[j];
      if (a.swaps[0].slot === b.swaps[0].slot && a.swaps[0].slotIndex === b.swaps[0].slotIndex) {
        continue;
      }
      const clears = over.every(
        (resource) => freed(a, resource) + freed(b, resource) >= overageOf(before, resource)
      );
      if (!clears) continue;
      const estimate = over.reduce(
        (sum, resource) => sum + freed(a, resource) + freed(b, resource),
        0
      );
      pairs.push({ swaps: [a.swaps[0], b.swaps[0]], estimate });
    }
  }
  pairs.sort((a, b) => b.estimate - a.estimate);

  const fittingPairs: FitOption[] = [];
  for (const pair of pairs.slice(0, PAIR_LIMIT)) {
    const option = await evaluate(pair.swaps);
    if (isCancelled?.()) return { options: [], nothingFits: false };
    if (option && fitsResourceBudget(option.after)) fittingPairs.push(option);
  }
  return {
    options: rankFitOptions(before, fittingPairs),
    nothingFits: fittingPairs.length === 0,
  };
}
