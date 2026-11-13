import { useMemo } from 'react';
import type { CloneState, EngineSkill, PlanEntry } from '@/engine/types';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { buildFitCheckRows, type FitCheckRow } from '@/features/skills/ships/fitCheckRows';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface MissingSkillRows {
  rows: FitCheckRow[];
  skills: ReadonlyMap<number, EngineSkill>;
  cloneState: CloneState;
  totalSeconds: number;
}

/**
 * The skills `entries` still needs, each with its time at the Character's
 * current attributes and implants (the schedule a Skill Plan uses); null
 * while the skill catalog loads.
 */
export function useMissingSkillRows(
  entries: readonly PlanEntry[],
  characterId: number
): MissingSkillRows | null {
  const { catalog, trainedSkills, attributes, implants } = usePlanEditorData(characterId);
  const cloneStates = useCloneStates((state) => state.value);
  useHydratedStore(useCloneStates);
  const cloneState = cloneStateFor(cloneStates, characterId);
  return useMemo(() => {
    if (!catalog) return null;
    const scheduled = scheduleEntries(entries, {
      skills: catalog.engineSkills,
      trainedSkills,
      attributes,
      implants,
      cloneState,
    });
    const rows = buildFitCheckRows(entries, catalog.engineSkills, trainedSkills, scheduled);
    return {
      rows,
      skills: catalog.engineSkills,
      cloneState,
      totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    };
  }, [catalog, entries, trainedSkills, attributes, implants, cloneState]);
}
