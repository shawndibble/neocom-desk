import type { ModulePool } from '@/engine/fittings/improve';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';

/** The module pool the catalogue gives Rework and the fills: group, group members, market-listed, hull and skills. */
export function modulePool(catalogue: FittingCatalogue, variants: VariantEvaluator): ModulePool {
  const listed = new Set(catalogue.marketTypes.map((entry) => entry.typeId));
  const flyable = new Map<string, boolean>();
  const skilled = new Map<string, boolean>();
  return {
    groupOf: (typeId) => catalogue.types[String(typeId)]?.groupID,
    typeIdsInGroup: (groupId) => catalogue.typeIdsByGroup.get(groupId) ?? [],
    published: (typeId) => listed.has(typeId),
    // A fitted module the pilot lacks skills for is replaced; its hull fit is not asked again.
    pilotCanFly: (slot, typeId) => {
      const key = `${slot}:${typeId}`;
      let ok = skilled.get(key);
      if (ok === undefined) {
        const check = variants.engine
          .checkCandidates(variants.fitting.shipTypeId, slot, [typeId], variants.profile)
          .get(typeId);
        ok = check ? check.canFly : true;
        skilled.set(key, ok);
      }
      return ok;
    },
    // A candidate the pilot lacks skills for goes under Train instead.
    flyable: (slot, typeId) => {
      const key = `${slot}:${typeId}`;
      let ok = flyable.get(key);
      if (ok === undefined) {
        const check = variants.engine
          .checkCandidates(variants.fitting.shipTypeId, slot, [typeId], variants.profile)
          .get(typeId);
        ok = check ? check.fitsHull && check.canFly : true;
        flyable.set(key, ok);
      }
      return ok;
    },
  };
}
