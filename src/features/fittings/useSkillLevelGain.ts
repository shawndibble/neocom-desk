/**
 * What one skill at a level the pilot picked does to the open Fitting.
 * "What to train" ranks each skill at its next level only; this works out any
 * other level on demand, when the pilot picks it, and is keyed on the
 * evaluator so a Fitting or Character change never shows the old fit's figures.
 */
import { useEffect, useState } from 'react';
import { levelGain, type LevelGain, type SkillGain } from '@/engine/fittings/skillGains';
import type { SkillGainEvaluator } from './useFittingEvaluation';

/** Null while a level other than the ranked one is being worked out. */
export function useSkillLevelGain(
  evaluator: SkillGainEvaluator | null,
  gain: SkillGain,
  level: number
): LevelGain | null {
  const [computed, setComputed] = useState<{
    evaluator: SkillGainEvaluator;
    skillTypeId: number;
    level: number;
    result: LevelGain | null;
  } | null>(null);
  const ranked = level === gain.toLevel;
  const { skillTypeId } = gain;

  useEffect(() => {
    if (!evaluator || ranked) return;
    let cancelled = false;
    void evaluator
      .compare(skillTypeId, level)
      .then(({ before, after }) => levelGain(before, after))
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setComputed({ evaluator, skillTypeId, level, result });
      });
    return () => {
      cancelled = true;
    };
  }, [evaluator, skillTypeId, level, ranked]);

  if (ranked) return gain;
  const fresh =
    computed?.evaluator === evaluator &&
    computed?.skillTypeId === skillTypeId &&
    computed?.level === level
      ? computed
      : null;
  return fresh?.result ?? null;
}
