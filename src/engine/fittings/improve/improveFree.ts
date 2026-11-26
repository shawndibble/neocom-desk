import type { ImproveGoal } from './improve';
import type { ImplantGoalId } from '../implantFinder';
import { overageOf, RESOURCES, type Resource } from '../makeItFit';
import type { GainSort } from '../skillGains';
import type { FittingStats } from '../types';

export const FREE_ROWS_SHOWN = 3;

export const TRAIN_SORT: Partial<Record<ImproveGoal, GainSort>> = {
  overall: 'overall',
  damage: 'dps',
  tank: 'ehp',
  speed: 'speed',
  reach: 'optimal',
};

export const IMPLANT_GOAL: Partial<Record<ImproveGoal, ImplantGoalId>> = {
  damage: 'appliedDps',
  tank: 'ehp',
  speed: 'speed',
  reach: 'weaponRange',
};

export function overBudgetResources(stats: FittingStats): Resource[] {
  return RESOURCES.filter((resource) => overageOf(stats, resource) > 0);
}
