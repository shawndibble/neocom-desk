/**
 * What one skill at a level the pilot picked does to the open Fitting.
 * "What to train" ranks each skill at its next level only; this works out any
 * other level on demand, when the pilot picks it, and is keyed on the
 * evaluator so a Fitting or Character change never shows the old fit's figures.
 */
import { useCallback } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { levelGain, type LevelGain, type SkillGain } from '@/engine/fittings/skillGains';
import type { SkillGainEvaluator } from './useFittingEvaluation';

export interface SkillLevelGainState {
  /** Null while a level other than the ranked one is being worked out, or when that failed. */
  gain: LevelGain | null;
  /** The calculation itself failed, so there is nothing to show for this level. */
  failed: boolean;
}

export function useSkillLevelGain(
  evaluator: SkillGainEvaluator | null,
  gain: SkillGain,
  level: number
): SkillLevelGainState {
  const ranked = level === gain.toLevel;
  const { skillTypeId } = gain;
  // Undefined: nothing to work out (no evaluator, or the ranked level already has its figures).
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
