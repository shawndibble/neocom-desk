import { getVariations, type VariationIndex } from '../../market/variations';
import type { ModulePool } from './improve';
import { offerableIn } from './improveCandidateFilter';
import { isMutated } from './improveMutated';
import type { FitSwap } from '../makeItFit';
import type { FittingModule } from '../types';

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
