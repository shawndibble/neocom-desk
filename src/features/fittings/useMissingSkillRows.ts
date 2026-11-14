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
  /** Not named by the fit: a prerequisite the schedule trains first. */
  prerequisite: boolean;
}

export interface MissingSkillRows {
  /** Skills the fit names that the Character lacks: the "Missing N skills" count. */
  missingCount: number;
  /** Every skill the schedule trains, in training order, prerequisites included. */
  rows: MissingSkillRow[];
  skills: ReadonlyMap<number, EngineSkill>;
  cloneState: CloneState;
  totalSeconds: number;
}

/**
 * What a training schedule needs for the Character: the skill catalog, their
 * trained skills, attributes, implants and clone state; null while the
 * catalog loads or with no Character.
 */
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

/**
 * The skills `entries` still needs, each with its time on the schedule a Skill
 * Plan uses. Prerequisites the schedule pulls in are rows too and count toward
 * `totalSeconds`, so it matches the ship info "to fly" time.
 */
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

/**
 * `missingSkillRows` at the Character's current attributes and implants; null
 * while the skill catalog loads.
 */
export function useMissingSkillRows(
  entries: readonly PlanEntry[],
  characterId: number
): MissingSkillRows | null {
  const ctx = useScheduleContext(characterId);
  return useMemo(() => (ctx ? missingSkillRows(entries, ctx) : null), [ctx, entries]);
}
