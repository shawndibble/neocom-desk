/**
 * The fit-goal picker's rows (issue #3564): each saved Fitting's state for
 * the active Character under this plan, from `evaluateFitGoal`.
 */
import { evaluateFitGoal } from '@/engine/fitGoal';
import { stepKey, type StepKey } from '@/engine/skills/skillPlanSchedule';
import type { PlanEntry, ScheduledStep } from '@/engine/types';
import type { FitGoalNeed } from './useFitGoalNeeds';

export type FitGoalOption =
  | { id: string; name: string; state: 'loading' }
  | { id: string; name: string; state: 'unknown' }
  | { id: string; name: string; state: 'flyable-now' }
  | { id: string; name: string; state: 'on-date'; date: Date }
  | { id: string; name: string; state: 'missing'; missingLevels: number; toAdd: PlanEntry[] };

/** Whether the picker can pick this row: not still loading, not unconfirmable, not already flyable. */
export function isFitGoalPickable(
  option: FitGoalOption
): option is Exclude<FitGoalOption, { state: 'loading' | 'unknown' | 'flyable-now' }> {
  return option.state !== 'loading' && option.state !== 'unknown' && option.state !== 'flyable-now';
}

export function fitGoalOptions(
  records: readonly { id: string; name: string }[],
  needs: ReadonlyMap<string, FitGoalNeed>,
  trainedLevels: ReadonlyMap<number, number>,
  scheduled: readonly ScheduledStep[],
  stepByKey: ReadonlyMap<StepKey, ScheduledStep>,
  startDate: Date,
  unknownIds: ReadonlySet<string>
): FitGoalOption[] {
  return records.map(({ id, name }): FitGoalOption => {
    const need = needs.get(id);
    if (!need && unknownIds.has(id)) return { id, name, state: 'unknown' };
    if (!need) return { id, name, state: 'loading' };
    const goal = evaluateFitGoal(need.needed, trainedLevels, scheduled);
    if (goal.state === 'flyable-now') return { id, name, state: 'flyable-now' };
    if (goal.state === 'missing') {
      return {
        id,
        name,
        state: 'missing',
        missingLevels: goal.missingLevels,
        toAdd: goal.missing,
      };
    }
    const step = goal.anchor ? stepByKey.get(stepKey(goal.anchor)) : undefined;
    if (!step) return { id, name, state: 'loading' };
    return {
      id,
      name,
      state: 'on-date',
      date: new Date(startDate.getTime() + step.cumulativeSeconds * 1000),
    };
  });
}
