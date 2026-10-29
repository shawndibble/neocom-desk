/**
 * Which Improve Goals lead as chips and which sit under "More goals". Pure.
 */
import { COMBAT_GOALS, IMPROVE_GOALS, type ImproveGoal } from './improve';
import { roleUnlocks, type HullRole } from './improveRole';

/** Goals the fit itself decides: they only matter once it has the modules, whatever the hull. */
const FIT_DERIVED_GOALS: readonly ImproveGoal[] = [
  'mining',
  'repair',
  'transfer',
  'tackle',
  'ewar',
  'command',
];

/**
 * Role-relevant goals lead as chips; the rest, and any the fit cannot score,
 * sit under "More goals". The picked goal stays a chip so the pick is visible,
 * unless the fit cannot score it.
 */
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
