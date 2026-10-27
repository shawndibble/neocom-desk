/**
 * Composes `suggestReorder` + `placeRemaps`: reorder first, then place
 * remaps on the new order — one-step "fastest plan, respecting priorities".
 */
import { placeRemaps, type PlaceRemapsOptions, type PlaceRemapsResult } from './placeRemaps';
import { suggestReorder } from './reorderSuggestion';
import type { EngineSkill, PlanMilestone, PlanPriority, PlanStep } from '@/engine/types';

export interface OptimizeForMeResult {
  /** The priority-respecting reorder — `suggestReorder`'s output. */
  order: PlanStep[];
  /** Remap placement on `order`, not on the plan's original order. */
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
