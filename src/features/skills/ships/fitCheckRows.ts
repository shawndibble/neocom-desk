/** One display row per skill a pasted fit needs. Pure — seconds come from `computeSkillPlanSchedule`'s own steps, not re-derived here. */
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';
import { skillTrainingStatus, type SkillTrainingStatus } from '../skillStatus';

export type FitCheckStatus = SkillTrainingStatus;

export interface FitCheckRow {
  skillTypeID: number;
  name: string;
  currentLevel: number;
  targetLevel: number;
  status: FitCheckStatus;
  /** Seconds still needed to reach `targetLevel`; 0 once `status` is 'trained'. */
  seconds: number;
}

export function buildFitCheckRows(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  scheduled: readonly ScheduledStep[]
): FitCheckRow[] {
  const secondsByTypeID = new Map<number, number>();
  for (const step of scheduled) {
    secondsByTypeID.set(
      step.skillTypeID,
      (secondsByTypeID.get(step.skillTypeID) ?? 0) + step.seconds
    );
  }

  return entries.map(({ skillTypeID, targetLevel }) => {
    const currentLevel = trainedSkills.get(skillTypeID)?.level ?? 0;
    const status = skillTrainingStatus(currentLevel, targetLevel);
    return {
      skillTypeID,
      name: skills.get(skillTypeID)?.name ?? `#${skillTypeID}`,
      currentLevel,
      targetLevel,
      status,
      seconds: status === 'trained' ? 0 : (secondsByTypeID.get(skillTypeID) ?? 0),
    };
  });
}
