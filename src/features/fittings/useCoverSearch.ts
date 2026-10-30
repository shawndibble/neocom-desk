/**
 * The ticked rows were each checked alone; together they can overrun, and the
 * pilot is then offered the swaps that cover it, searched once the set has
 * sat still for a moment.
 */
import { useEffect, useState } from 'react';
import { applyImproveCandidate, type ImproveOption } from '@/engine/fittings/improve';
import { findCompletions } from '@/engine/fittings/improveComplete';
import { slotsOf } from '@/engine/fittings/improveKeys';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import type { ImproveSearch } from './useImprove';

/** How long a set must sit over budget before its covering swaps are searched: ticking several rows in a row searches once. */
const COMPLETION_DELAY_MS = 400;

export interface CoverSearchInput {
  fitting: Fitting | null | undefined;
  recalc: ImproveSearch['recalc'];
  completion: ImproveSearch['completion'];
  /** The ticked set's stats, once checked. */
  checked: FittingStats | null | undefined;
  overruns: boolean;
  chosen: ImproveOption[];
  chosenKey: string;
}

/** The covers found for the set named by `key`; null until the first search lands. */
export function useCoverSearch({
  fitting,
  recalc,
  completion,
  checked,
  overruns,
  chosen,
  chosenKey,
}: CoverSearchInput) {
  const [covers, setCovers] = useState<{ key: string; options: ImproveOption[] } | null>(null);
  useEffect(() => {
    if (!fitting || !recalc || !completion || !checked || !overruns || chosen.length === 0) return;
    let stale = false;
    const timer = setTimeout(() => {
      void (async () => {
        const taken = new Set(chosen.flatMap((pick) => slotsOf(pick.candidate)));
        const pool = await completion();
        const options = await findCompletions({
          fitting: chosen.reduce(
            (acc, pick) => applyImproveCandidate(acc, pick.candidate),
            fitting
          ),
          before: checked,
          swaps: pool.swaps.filter((swap) => !taken.has(`${swap.slot}${swap.slotIndex}`)),
          stats: recalc,
          priceOf: pool.priceOf,
          isCancelled: () => stale,
        });
        if (!stale) setCovers({ key: chosenKey, options });
      })().catch(() => !stale && setCovers({ key: chosenKey, options: [] }));
    }, COMPLETION_DELAY_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [fitting, recalc, completion, checked, overruns, chosen, chosenKey]);
  return covers;
}
