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
    if (!catalog || !trainedSkillsKnown) return levels;
    try {
      const known = plan.entries.filter((e) => catalog.engineSkills.has(e.skillTypeID));
      for (const step of normalizePlan(known, catalog.engineSkills, trainedSkills)) {
        raise(step.skillTypeID, step.level);
      }
    } catch {}
    return levels;
  }, [plan, catalog, trainedSkills, trainedSkillsKnown]);
}
