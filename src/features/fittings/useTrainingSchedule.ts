/**
 * How long some skill levels take the active Character — prerequisites
 * included, at their attributes, implants and clone state — the schedule a
 * Skill Plan uses. Shared by What to train and Make it fit.
 */
import { useMemo } from 'react';
import type { SkillPlanRecord } from '@/db';
import { normalizePlan } from '@/engine/skills/plan';
import type { EngineSkill, TrainedSkill } from '@/engine/types';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { useHydratedStore } from '@/lib/useHydratedStore';
import type { ScheduleEntries } from './useModuleUpgrades';

export function useTrainingSchedule(characterId: number) {
  const data = usePlanEditorData(characterId);
  const { catalog, trainedSkills, trainedSkillsKnown, attributes, implants } = data;
  const cloneStates = useCloneStates((state) => state.value);
  useHydratedStore(useCloneStates);
  const cloneState = cloneStateFor(cloneStates, characterId);
  // Null before the Character's skills are in, or every row would time from level 0.
  const scheduleEntriesFor = useMemo(
    (): ScheduleEntries | null =>
      catalog && trainedSkillsKnown
        ? (entries) =>
            scheduleEntries(entries, {
              skills: catalog.engineSkills,
              trainedSkills,
              attributes,
              implants,
              cloneState,
            })
        : null,
    [catalog, trainedSkills, trainedSkillsKnown, attributes, implants, cloneState]
  );
  return { ...data, scheduleEntriesFor };
}

/**
 * Highest level `plan` trains each skill to — its derived prerequisite rows
 * included, so a level it already trains on the way to another entry isn't
 * offered again as a redundant entry.
 */
export function usePlannedLevels(
  plan: SkillPlanRecord | undefined,
  catalog: { engineSkills: ReadonlyMap<number, EngineSkill> } | null | undefined,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  trainedSkillsKnown: boolean
): ReadonlyMap<number, number> {
  return useMemo(() => {
    const levels = new Map<number, number>();
    if (!plan) return levels;
    const raise = (skillTypeID: number, level: number) =>
      levels.set(skillTypeID, Math.max(levels.get(skillTypeID) ?? 0, level));
    for (const entry of plan.entries) raise(entry.skillTypeID, entry.targetLevel);
    // Not before the Character's skills are in, or every prerequisite would count as untrained.
    if (!catalog || !trainedSkillsKnown) return levels;
    try {
      const known = plan.entries.filter((e) => catalog.engineSkills.has(e.skillTypeID));
      for (const step of normalizePlan(known, catalog.engineSkills, trainedSkills)) {
        raise(step.skillTypeID, step.level);
      }
    } catch {
      // A circular plan is the Skill Plan editor's to report; its entries still count.
    }
    return levels;
  }, [plan, catalog, trainedSkills, trainedSkillsKnown]);
}
