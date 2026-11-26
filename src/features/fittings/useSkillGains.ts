import { useEffect, useState } from 'react';
import {
  evaluateSkillGains,
  skillGainCandidates,
  type SkillGain,
} from '@/engine/fittings/skillGains';
import type { SkillGainEvaluator } from './useFittingEvaluation';

export interface SkillGainsState {
  gains: SkillGain[] | null;
  loading: boolean;
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
    const controller = new AbortController();
    void (async () => {
      let sourceIds: number[];
      try {
        sourceIds = await evaluator.skillSources();
      } catch {
        if (!cancelled) setComputed({ evaluator, gains: null });
        return;
      }
      const candidates = skillGainCandidates(sourceIds, evaluator.profile.skillLevels);
      const gains = await evaluateSkillGains(
        candidates,
        (skillTypeId, level) => evaluator.compare(skillTypeId, level, controller.signal),
        { cancelled: () => cancelled }
      );
      if (gains === null || cancelled) return;
      setComputed({ evaluator, gains });
    })();
    return () => {
      cancelled = true;
      controller.abort();
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
