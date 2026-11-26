import { computeSkillPlanSchedule } from '@/engine/skills/skillPlanSchedule';
import type {
  Attributes,
  CloneState,
  EngineSkill,
  Implants,
  PlanEntry,
  ScheduledStep,
  TrainedSkill,
} from '@/engine/types';

export interface ScheduleEntriesContext {
  skills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  attributes: Attributes;
  implants: Implants;
  cloneState: CloneState;
}

export function scheduleEntries(
  entries: readonly PlanEntry[],
  ctx: ScheduleEntriesContext
): readonly ScheduledStep[] {
  return computeSkillPlanSchedule({
    entries,
    ...ctx,
    boosters: [],
    markers: undefined,
    markerAttributes: [],
    startDate: new Date(),
  }).scheduled;
}
