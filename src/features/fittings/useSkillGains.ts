/**
 * "What to train": each +1 skill level that changes the open Fitting, with
 * its whole-Fitting delta (`engine/fittings/skillGains.ts`). The candidates
 * come from one sources pass; each is then worked out on its own, handing
 * the main thread back between them, and the run is keyed on the evaluator
 * so a Fitting or Character change mid-way never shows the old fit's rows.
 */
import { useEffect, useState } from 'react';
import {
  evaluateSkillGains,
  skillGainCandidates,
  type SkillGain,
} from '@/engine/fittings/skillGains';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { yieldToEventLoop } from './yieldToEventLoop';

export interface SkillGainsState {
  /** Null while working out (or with no evaluator); in candidate order — the panel ranks them. */
  gains: SkillGain[] | null;
  loading: boolean;
  /** The sources pass itself failed, so there is nothing to rank. */
  failed: boolean;
}

export function useSkillGains(evaluator: SkillGainEvaluator | null): SkillGainsState {
  const [computed, setComputed] = useState<{
    evaluator: SkillGainEvaluator;
    gains: SkillGain[] | null;
  } | null>(null);

  useEffect(() => {
    if (!evaluator) return;
    let cancelled = false;
    void (async () => {
      let sourceIds: number[];
      try {
        sourceIds = await evaluator.skillSources();
      } catch {
        if (!cancelled) setComputed({ evaluator, gains: null });
        return;
      }
      const candidates = skillGainCandidates(sourceIds, evaluator.profile.skillLevels);
      // One +1 level at a time, as Variations does: each `compare` is a
      // synchronous engine calculation, and run together they'd land in
      // one long task and freeze input.
      const gains = await evaluateSkillGains(candidates, evaluator.compare, {
        between: yieldToEventLoop,
        cancelled: () => cancelled,
      });
      if (gains === null || cancelled) return;
      setComputed({ evaluator, gains });
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluator]);

  if (!evaluator) return { gains: null, loading: false, failed: false };
  const fresh = computed?.evaluator === evaluator ? computed : null;
  return {
    gains: fresh?.gains ?? null,
    loading: fresh === null,
    failed: fresh !== null && fresh.gains === null,
  };
}
