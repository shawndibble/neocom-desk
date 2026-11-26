import { useMemo } from 'react';
import { characterFlyGap } from '@/engine/fittings/characterFlyGap';
import type { CloneState, EngineSkill, PlanEntry } from '@/engine/types';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { buildFitCheckRows, type FitCheckRow } from '@/features/skills/ships/fitCheckRows';
import {
  scheduleEntries,
  type ScheduleEntriesContext,
} from '@/features/skills/ships/scheduleEntries';
import { useHydratedStore } from '@/lib/useHydratedStore';

export interface MissingSkillRow extends FitCheckRow {
  prerequisite: boolean;
}

export interface MissingSkillRows {
  missingCount: number;
  rows: MissingSkillRow[];
  skills: ReadonlyMap<number, EngineSkill>;
  cloneState: CloneState;
  totalSeconds: number;
}

export function useScheduleContext(characterId: number | null): ScheduleEntriesContext | null {
  const { catalog, trainedSkills, attributes, implants } = usePlanEditorData(characterId);
  const cloneStates = useCloneStates((state) => state.value);
  useHydratedStore(useCloneStates);
  return useMemo(
    () =>
      catalog && characterId !== null
        ? {
            skills: catalog.engineSkills,
            trainedSkills,
            attributes,
            implants,
            cloneState: cloneStateFor(cloneStates, characterId),
          }
        : null,
    [catalog, characterId, trainedSkills, attributes, implants, cloneStates]
  );
}

export function missingSkillRows(
  entries: readonly PlanEntry[],
  ctx: ScheduleEntriesContext
): MissingSkillRows {
  const scheduled = scheduleEntries(entries, ctx);
  const gap = characterFlyGap(entries, scheduled);
  const rows = buildFitCheckRows(gap.skills, ctx.skills, ctx.trainedSkills, scheduled).map(
    (row, i) => ({ ...row, prerequisite: !gap.skills[i].direct })
  );
  return {
    missingCount: gap.missingCount,
    rows,
    skills: ctx.skills,
    cloneState: ctx.cloneState,
    totalSeconds: gap.totalSeconds,
  };
}

export function useMissingSkillRows(
  entries: readonly PlanEntry[],
  characterId: number
): MissingSkillRows | null {
  const ctx = useScheduleContext(characterId);
  return useMemo(() => (ctx ? missingSkillRows(entries, ctx) : null), [ctx, entries]);
}
