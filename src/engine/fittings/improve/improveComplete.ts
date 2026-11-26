import { chainOf, iskDeltaOf, type ImproveCandidate, type ImproveOption } from './improve';
import { findFitSwaps, type FitSwap } from '../makeItFit';
import type { Fitting, FittingStats } from '../types';

export const COMPLETIONS_SHOWN = 3;

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
  fitting: Fitting;
  before: FittingStats;
  swaps: readonly FitSwap[];
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  isCancelled?: () => boolean;
}

export async function findCompletions({
  fitting,
  before,
  swaps,
  stats,
  priceOf,
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
    const isk = iskDeltaOf(candidate, priceOf);
    return [
      {
        candidate,
        fitting: option.fitting,
        after: option.after,
        score: 0,
        iskDelta: isk,
        lost: [],
      },
    ];
  });
}
