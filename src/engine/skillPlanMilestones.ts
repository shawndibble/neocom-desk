/**
 * Plan Milestone (CONTEXT.md): a named goal ("Fly Loki") pinned to a plan
 * entry's skill level, anchored to a `StepKey` rather than a position — a
 * reorder or a removal changes the schedule's `stepByKey` map, never the
 * milestone's own identity, so a status computed here simply misses the
 * anchor when it's gone rather than pointing at whatever step now sits at a
 * stale index.
 */
import { stepKey, type StepKey } from './skillPlanSchedule';
import type { PlanMilestone, ScheduledStep, TrainedSkill } from './types';

export type MilestoneState = 'projected' | 'reached' | 'orphaned';

export interface MilestoneStatus {
  milestone: PlanMilestone;
  state: MilestoneState;
  /** Set only for 'projected' — when the anchor step, and everything it needs, finishes training. */
  finish: Date | null;
}

/** The (skillTypeID, level) key a milestone is looked up in `stepByKey` by — exported so a caller building its own by-anchor map (PlanEditor's row lookup) uses the identical key rather than re-deriving it. */
export function milestoneKey(milestone: PlanMilestone): StepKey {
  return stepKey({ skillTypeID: milestone.skillTypeID, level: milestone.level });
}

/**
 * Each milestone's state against the current schedule, soonest-finish first
 * — 'projected' milestones in finish order, then 'reached'/'orphaned' ones
 * (no finish to order by) in their original order.
 *
 * A milestone whose anchor step is absent from `stepByKey` is 'reached' when
 * the character is already trained to that level, and 'orphaned' otherwise —
 * most often because the entry was removed, but the same state also follows
 * if the entry's own target level dropped below the milestone's, or if the
 * anchor names a skill the catalog no longer knows. Orphaned is never
 * silently dropped; it is the caller's job to still list it, with a remove
 * action.
 */
export function milestoneStates(
  stepByKey: ReadonlyMap<StepKey, ScheduledStep>,
  startDate: Date,
  milestones: readonly PlanMilestone[],
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): MilestoneStatus[] {
  const statuses = milestones.map((milestone): MilestoneStatus => {
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

/** The soonest 'projected' milestone, or undefined once none is still ahead. */
export function nextMilestone(statuses: readonly MilestoneStatus[]): MilestoneStatus | undefined {
  return statuses.find((s) => s.state === 'projected');
}
