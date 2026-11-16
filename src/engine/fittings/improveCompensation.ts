/**
 * The swaps that can pay for an Improve fix: when replacing a module the pilot
 * cannot fly runs the fit out of CPU, powergrid or calibration, another fitted
 * module or rig steps down to a sibling to cover it. Shares the candidates'
 * rule for what may go into a slot (`offerableIn`). Pure.
 */
import { getVariations, type VariationIndex } from '../market/variations';
import type { ModulePool } from './improve';
import { offerableIn } from './improveCandidateFilter';
import { isMutated } from './improveMutated';
import type { FitSwap } from './makeItFit';
import type { FittingModule } from './types';

/**
 * Every fitted module's and rig's siblings the hull takes and the pilot can fly,
 * whatever the Reach or the rigs tick: never Officer or Deadspace, never a
 * subsystem, and never a mutated module, which would lose its roll (#5800).
 */
export function compensationSwaps(
  modules: readonly FittingModule[],
  index: VariationIndex,
  rackOf: Readonly<Record<string, string>>,
  pool: ModulePool
): FitSwap[] {
  const offerable = offerableIn(index, rackOf, pool, false);
  return modules.flatMap((module) => {
    if (module.slot === 'subsystem' || isMutated(module)) return [];
    return getVariations(index, module.typeId)
      .members.filter(
        (member) => member.typeId !== module.typeId && offerable(member.typeId, module.slot)
      )
      .map((member) => ({
        slot: module.slot,
        slotIndex: module.slotIndex,
        fromTypeId: module.typeId,
        toTypeId: member.typeId,
      }));
  });
}
