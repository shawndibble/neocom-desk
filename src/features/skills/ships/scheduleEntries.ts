/** A one-off schedule for a set of entries, no boosters/markers/remaps — Fit Check and Mastery both just want "how long from here," not a full plan's machinery. */
import { computeSkillPlanSchedule } from '@/engine/skillPlanSchedule';
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
