/**
 * What Improve's free sections (Train, Implants) and "Fix this first" read
 * from an Improve Goal (scope decision `20261024-171917`). Pure.
 */
import type { ImproveGoal } from './improve';
import type { ImplantGoalId } from './implantFinder';
import { overageOf, RESOURCES, type Resource } from './makeItFit';
import type { GainSort } from './skillGains';
import type { FittingStats } from './types';

/** How many rows each free section shows: a few best answers, not a whole list. */
export const FREE_ROWS_SHOWN = 3;

/** The What to train metric each goal ranks skills and module upgrades by; Cheaper has none (training saves no ISK). */
export const TRAIN_SORT: Partial<Record<ImproveGoal, GainSort>> = {
  overall: 'overall',
  damage: 'dps',
  tank: 'ehp',
  speed: 'speed',
  reach: 'optimal',
};

/** The Implant Finder goal each Improve Goal reuses; Best overall and Cheaper have none (no one stat to chase). */
export const IMPLANT_GOAL: Partial<Record<ImproveGoal, ImplantGoalId>> = {
  damage: 'appliedDps',
  tank: 'ehp',
  speed: 'speed',
  reach: 'weaponRange',
};

/** The budgets the fit is over, in Make it fit's order; empty for a fit that fits. */
export function overBudgetResources(stats: FittingStats): Resource[] {
  return RESOURCES.filter((resource) => overageOf(stats, resource) > 0);
}
