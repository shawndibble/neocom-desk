import { useCallback } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { levelGain, type LevelGain, type SkillGain } from '@/engine/fittings/skillGains';
import type { SkillGainEvaluator } from './useFittingEvaluation';

export interface SkillLevelGainState {
  gain: LevelGain | null;
  failed: boolean;
}

export function useSkillLevelGain(
  evaluator: SkillGainEvaluator | null,
  gain: SkillGain,
  level: number
): SkillLevelGainState {
  const ranked = level === gain.toLevel;
  const { skillTypeId } = gain;
  const load = useCallback(
    () =>
      !evaluator || ranked
        ? Promise.resolve(undefined)
        : evaluator
            .compare(skillTypeId, level)
            .then(({ before, after }) => levelGain(before, after)),
    [evaluator, skillTypeId, level, ranked]
  );
  const computed = useAsyncLoad<LevelGain | undefined>(load);
  if (ranked) return { gain, failed: false };
  return { gain: computed.data ?? null, failed: computed.status === 'failed' };
}
