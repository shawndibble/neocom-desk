/**
 * The fit-goal picker's rows (issue #3564): each saved Fitting's state for
 * the active Character under this plan, from `evaluateFitGoal`.
 */
import { evaluateFitGoal } from '@/engine/fitGoal';
import { stepKey, type StepKey } from '@/engine/skillPlanSchedule';
import type { PlanEntry, ScheduledStep } from '@/engine/types';
import type { FitGoalNeed } from './useFitGoalNeeds';

export type FitGoalOption =
  | { id: string; name: string; state: 'loading' }
  | { id: string; name: string; state: 'flyable-now' }
  | { id: string; name: string; state: 'on-date'; date: Date }
  | { id: string; name: string; state: 'missing'; missingLevels: number; toAdd: PlanEntry[] };

export function fitGoalOptions(
  records: readonly { id: string; name: string }[],
  needs: ReadonlyMap<string, FitGoalNeed>,
  trainedLevels: ReadonlyMap<number, number>,
  scheduled: readonly ScheduledStep[],
  stepByKey: ReadonlyMap<StepKey, ScheduledStep>,
  startDate: Date
): FitGoalOption[] {
  return records.map(({ id, name }): FitGoalOption => {
    const need = needs.get(id);
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
