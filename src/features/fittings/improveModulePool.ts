import type { ModulePool } from '@/engine/fittings/improve';
import type { FittingSlotKind } from '@/engine/fittings/types';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';

export type FitCheck = (
  slot: FittingSlotKind,
  typeId: number
) => { fitsHull: boolean; canFly: boolean } | undefined;

export function fitCheckOf(variants: VariantEvaluator): FitCheck {
  return (slot, typeId) =>
    variants.engine
      .checkCandidates(variants.fitting.shipTypeId, slot, [typeId], variants.profile)
      .get(typeId);
}

export function modulePool(catalogue: FittingCatalogue, fitCheck: FitCheck): ModulePool {
  const listed = new Set(catalogue.marketTypes.map((entry) => entry.typeId));
  const flyable = new Map<string, boolean>();
  const skilled = new Map<string, boolean>();
  return {
    groupOf: (typeId) => catalogue.types[String(typeId)]?.groupID,
    typeIdsInGroup: (groupId) => catalogue.typeIdsByGroup.get(groupId) ?? [],
    published: (typeId) => listed.has(typeId),
    nameOf: (typeId) => catalogue.types[String(typeId)]?.name,
    pilotCanFly: (slot, typeId) => {
      const key = `${slot}:${typeId}`;
      let ok = skilled.get(key);
      if (ok === undefined) {
        const check = fitCheck(slot, typeId);
        ok = check ? check.canFly : true;
        skilled.set(key, ok);
      }
      return ok;
    },
    flyable: (slot, typeId) => {
      const key = `${slot}:${typeId}`;
      let ok = flyable.get(key);
      if (ok === undefined) {
        const check = fitCheck(slot, typeId);
        ok = check ? check.fitsHull && check.canFly : true;
        flyable.set(key, ok);
      }
      return ok;
    },
  };
}
