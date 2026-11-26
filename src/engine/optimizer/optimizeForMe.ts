import { placeRemaps, type PlaceRemapsOptions, type PlaceRemapsResult } from './placeRemaps';
import { suggestReorder } from './reorderSuggestion';
import type { EngineSkill, PlanMilestone, PlanPriority, PlanStep } from '@/engine/types';

export interface OptimizeForMeResult {
  order: PlanStep[];
  remaps: PlaceRemapsResult;
}

export function optimizeForMe(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  options: PlaceRemapsOptions,
  priorities?: ReadonlyMap<number, PlanPriority>,
  milestones?: readonly PlanMilestone[]
): OptimizeForMeResult {
  const order = suggestReorder(steps, skills, priorities, milestones);
  const remaps = placeRemaps(order, skills, options);
  return { order, remaps };
}
