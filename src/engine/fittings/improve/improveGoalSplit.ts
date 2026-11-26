import { COMBAT_GOALS, IMPROVE_GOALS, type ImproveGoal } from './improve';
import { roleUnlocks, type HullRole } from './improveRole';

const FIT_DERIVED_GOALS: readonly ImproveGoal[] = [
  'mining',
  'repair',
  'transfer',
  'tackle',
  'ewar',
  'command',
];

export function splitGoals(
  goal: ImproveGoal,
  role: HullRole,
  isAvailable: (id: ImproveGoal) => boolean
): { relevant: ImproveGoal[]; other: ImproveGoal[] } {
  const roleGoals: readonly ImproveGoal[] = role === 'combat' ? COMBAT_GOALS : roleUnlocks(role);
  const isRelevant = (id: ImproveGoal) =>
    isAvailable(id) && (id === goal || roleGoals.includes(id) || FIT_DERIVED_GOALS.includes(id));
  return {
    relevant: IMPROVE_GOALS.filter(isRelevant),
    other: IMPROVE_GOALS.filter((id) => !isRelevant(id)),
  };
}
