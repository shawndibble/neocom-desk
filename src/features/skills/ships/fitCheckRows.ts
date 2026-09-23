/**
 * Fit Check's own display shape: one row per skill a pasted fit needs,
 * independent of any Skill Plan. Pure — the caller supplies `entries` (from
 * `fitToSkills`), the Character's trained skills, and the scheduled steps
 * `computeSkillPlanSchedule` produced for those same entries (reused rather
 * than re-deriving training time here).
 */
import type { EngineSkill, PlanEntry, ScheduledStep, TrainedSkill } from '@/engine/types';

export type FitCheckStatus = 'trained' | 'partial' | 'missing';

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
    const status: FitCheckStatus =
      currentLevel >= targetLevel ? 'trained' : currentLevel === 0 ? 'missing' : 'partial';
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
