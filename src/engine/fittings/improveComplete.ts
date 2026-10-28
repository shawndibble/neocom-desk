/**
 * Completing a ticked set: each Improve row fits on its own, but the rows
 * ticked together can run the fit out of CPU, powergrid or calibration. These
 * are the module and rig swaps, found on the set as it stands, that bring it
 * back under, so the pilot is never left with Apply locked and nothing to do.
 * Pure.
 */
import {
  chainOf,
  iskDeltaOf,
  type ImproveCandidate,
  type ImproveMode,
  type ImproveOption,
} from './improve';
import { findFitSwaps, type FitSwap } from './makeItFit';
import type { Fitting, FittingStats } from './types';

/** How many ways to cover the set are offered. */
export const COMPLETIONS_SHOWN = 3;

/** `candidates` as one candidate with the rest chained behind it (each one's own pair kept); undefined for none. */
export function mergeCandidates(
  candidates: readonly ImproveCandidate[]
): ImproveCandidate | undefined {
  const append = (head: ImproveCandidate, tail: ImproveCandidate | undefined): ImproveCandidate =>
    tail ? { ...head, pairedWith: head.pairedWith ? append(head.pairedWith, tail) : tail } : head;
  return candidates.reduceRight<ImproveCandidate | undefined>(
    (tail, head) => append(head, tail),
    undefined
  );
}

export interface FindCompletionsParams {
  /** The fit with every ticked row made. */
  fitting: Fitting;
  /** That fit's stats, over a budget. */
  before: FittingStats;
  /** Swaps on slots the ticked rows leave alone. */
  swaps: readonly FitSwap[];
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  mode: ImproveMode;
  isCancelled?: () => boolean;
}

/** The swaps that cover the set, as options a tick adds: fewest changes first, then the least stat loss and the cheaper. */
export async function findCompletions({
  fitting,
  before,
  swaps,
  stats,
  priceOf,
  mode,
  isCancelled,
}: FindCompletionsParams): Promise<ImproveOption[]> {
  const found = await findFitSwaps({
    fitting,
    before,
    candidates: swaps,
    stats,
    priceOf,
    ...(isCancelled ? { isCancelled } : {}),
  });
  return found.options.slice(0, COMPLETIONS_SHOWN).flatMap((option) => {
    const candidate = chainOf(option.swaps);
    if (!candidate) return [];
    const { isk, destroysRigs } = iskDeltaOf(candidate, priceOf, mode);
    return [
      {
        candidate,
        fitting: option.fitting,
        after: option.after,
        score: 0,
        iskDelta: isk,
        destroysRigs,
        lost: [],
      },
    ];
  });
}
