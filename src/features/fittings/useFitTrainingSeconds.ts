import { useMemo } from 'react';
import type { FitSkillVerdict } from '@/engine/fittings/fitSkillVerdict';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useActiveCharacter } from '@/stores/activeCharacter';

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
  const { catalog, trainedSkills, attributes, implants } = usePlanEditorData(characterId);
  const cloneStates = useCloneStates((state) => state.value);
  useHydratedStore(useCloneStates);

  return useMemo(() => {
    const seconds = new Map<string, number>();
    if (verdicts === null || characterId === null) return seconds;
    const ctx = catalog && {
      skills: catalog.engineSkills,
      trainedSkills,
      attributes,
      implants,
      cloneState: cloneStateFor(cloneStates, characterId),
    };
    for (const [key, verdict] of verdicts) {
      if (verdict.kind === 'canFly') seconds.set(key, 0);
      else if (verdict.kind === 'missing' && ctx) {
        const scheduled = scheduleEntries(verdict.skills, ctx);
        const rows = buildFitCheckRows(verdict.skills, ctx.skills, trainedSkills, scheduled);
        seconds.set(
          key,
          rows.reduce((sum, row) => sum + row.seconds, 0)
        );
      }
    }
    return seconds;
  }, [verdicts, characterId, catalog, trainedSkills, attributes, implants, cloneStates]);
}
