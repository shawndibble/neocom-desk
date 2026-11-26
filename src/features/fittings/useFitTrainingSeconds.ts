import { useMemo } from 'react';
import type { FitSkillVerdict } from '@/engine/fittings/fitSkillVerdict';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { missingSkillRows, useScheduleContext } from './useMissingSkillRows';

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
