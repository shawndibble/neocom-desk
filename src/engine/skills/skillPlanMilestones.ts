import { stepKey, type StepKey } from './skillPlanSchedule';
import type { PlanMilestone, ScheduledStep, TrainedSkill } from '../types';

export type MilestoneState = 'projected' | 'reached' | 'orphaned';

export interface MilestoneStatus {
  milestone: PlanMilestone;
  state: MilestoneState;
  finish: Date | null;
}

export function milestoneKey(milestone: PlanMilestone): StepKey {
  return stepKey({ skillTypeID: milestone.skillTypeID, level: milestone.level });
}

export function milestoneStates(
  stepByKey: ReadonlyMap<StepKey, ScheduledStep>,
  startDate: Date,
  milestones: readonly PlanMilestone[],
  trainedSkills: ReadonlyMap<number, TrainedSkill>,
  goneFittingIds: ReadonlySet<string> = new Set()
): MilestoneStatus[] {
  const statuses = milestones.map((milestone): MilestoneStatus => {
    if (milestone.fittingId !== undefined && goneFittingIds.has(milestone.fittingId)) {
      return { milestone, state: 'orphaned', finish: null };
    }
    const step = stepByKey.get(milestoneKey(milestone));
    if (step) {
      return {
        milestone,
        state: 'projected',
        finish: new Date(startDate.getTime() + step.cumulativeSeconds * 1000),
      };
    }
    const trained = trainedSkills.get(milestone.skillTypeID);
    const reached = trained !== undefined && trained.level >= milestone.level;
    return { milestone, state: reached ? 'reached' : 'orphaned', finish: null };
  });
  return statuses.sort((a, b) => {
    if (a.finish && b.finish) return a.finish.getTime() - b.finish.getTime();
    if (a.finish) return -1;
    if (b.finish) return 1;
    return 0;
  });
}

export function nextMilestone(statuses: readonly MilestoneStatus[]): MilestoneStatus | undefined {
  return statuses.find((s) => s.state === 'projected');
}
