import { useMemo } from 'react';
import type { FitSkillVerdict } from '@/engine/fittings/fitSkillVerdict';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { missingSkillRows, useScheduleContext } from './useMissingSkillRows';

/**
 * Each Popular fit's training left for the active Character, in seconds, at
 * their current attributes and implants (the schedule `MissingSkillsChip`
 * shows): 0 for a fit they can fly, absent for one with no verdict or before
 * the skill catalog loads. Drives "Least training" and the nearest fit.
 */
export function useFitTrainingSeconds(
  verdicts: ReadonlyMap<string, FitSkillVerdict> | null
): ReadonlyMap<string, number> {
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const ctx = useScheduleContext(characterId);
  return useMemo(() => {
    const seconds = new Map<string, number>();
    if (verdicts === null) return seconds;
    for (const [key, verdict] of verdicts) {
      if (verdict.kind === 'canFly') seconds.set(key, 0);
      else if (verdict.kind === 'missing' && ctx)
        seconds.set(key, missingSkillRows(verdict.skills, ctx).totalSeconds);
    }
    return seconds;
  }, [verdicts, ctx]);
}
