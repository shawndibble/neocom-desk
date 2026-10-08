/**
 * "Make it fit": the smallest meta-variant swaps (modules and rigs) that bring
 * an over-CPU/PG/calibration Fitting back under budget. Every candidate is
 * recalculated whole through the injected `stats` — CPU and PG depend on the
 * pilot's skills and implants, so a module's own attributes would lie — and is
 * offered only when `fitsResourceBudget` passes. Singles come first; pairs
 * are tried only when no single swap fits.
 */
import { swapModuleType } from './fittingEdit';
import { fitsResourceBudget, resourceOverage } from './skillGaps';
import type { Fitting, FittingSlotKind, FittingStats } from './types';

/** One fitted module or rig replaced by a sibling variant. */
export interface FitSwap {
  slot: FittingSlotKind;
  slotIndex: number;
  fromTypeId: number;
  toTypeId: number;
}

export interface FitOption {
  /** One swap, or two when no single swap fits. */
  swaps: FitSwap[];
  fitting: Fitting;
  after: FittingStats;
  /** What the swaps cost to buy net of the parts replaced; null when either price is unknown. */
  iskDelta: number | null;
}

export interface FitSwapsResult {
  options: FitOption[];
  /** The Fitting is over budget and no swap (or pair) brings it under. */
  nothingFits: boolean;
}

/**
 * Two options within this much relative loss of the fit's headline stats
 * (damage, tank, speed) count as costing the same, so the cheaper one wins.
 * See the scope decision recorded for #2828.
 */
export const STAT_TOLERANCE = 0.05;

/** Pairs are only tried for this many best-estimated combinations. */
export const PAIR_LIMIT = 40;

type Resource = 'cpu' | 'powergrid' | 'calibration';
const RESOURCES: readonly Resource[] = ['cpu', 'powergrid', 'calibration'];

function used(stats: FittingStats, resource: Resource): number {
  if (resource === 'cpu') return stats.cpuUsed;
  if (resource === 'powergrid') return stats.powergridUsed;
  return stats.calibrationUsed;
}

function overageOf(stats: FittingStats, resource: Resource): number {
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

/** Relative loss across the headline stats (damage, tank, speed); gains don't offset losses. */
function statLoss(before: FittingStats, after: FittingStats): number {
  const pairs: [number, number][] = [
    [before.offense.dps, after.offense.dps],
    [before.ehp, after.ehp],
    [before.navigation.maxVelocity, after.navigation.maxVelocity],
  ];
  return pairs.reduce((sum, [b, a]) => (b > 0 ? sum + Math.max(0, (b - a) / b) : sum), 0);
}

/** Smallest stat loss first; options within `STAT_TOLERANCE` of the best are ordered by ISK, unpriced last. */
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
  return [...near, ...far].map((entry) => entry.option);
}

export interface FindFitSwapsParams {
  fitting: Fitting;
  /** The open Fitting's own stats, as it stands. */
  before: FittingStats;
  candidates: readonly FitSwap[];
  /** Whole-fit stats under the pilot, implants and conditions the page shows. */
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  /** Hands the main thread back between calculations. */
  yieldFn?: () => Promise<void>;
  isCancelled?: () => boolean;
}

export async function findFitSwaps({
  fitting,
  before,
  candidates,
  stats,
  priceOf,
  yieldFn,
  isCancelled,
}: FindFitSwapsParams): Promise<FitSwapsResult> {
  const over = RESOURCES.filter((resource) => overageOf(before, resource) > 0);
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

  // Pairs: estimate each from its two singles' freed resources, keep the best
  // few, and recalculate those whole — stacking can sink a summed estimate.
  const freed = (option: FitOption, resource: Resource) =>
    used(before, resource) - used(option.after, resource);
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
