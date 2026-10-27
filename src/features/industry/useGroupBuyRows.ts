import { useMemo } from 'react';
import { totalVolume } from '@/engine/industry/materialVolume';
import type { MaterialCostLine } from '@/engine/industry/types';
import { volumeForType, type BlueprintCatalog } from './blueprintCatalog';
import type { GroupRollupView } from './groupRollupView';

/** A merged materials row still open to buying, plus the buy-list's own
 * netted remainder — see the `buyRows`/`craftedTypeIds` split below. */
export type BuyMaterialRow = MaterialCostLine & { buyToShow: number };

/**
 * Materials merge Need/Owned/Still-to-buy into one table now (issue: group
 * page redesign) — but a material fully covered by this group's own build
 * tree (`builtQuantityByType`) was never bought at all, so it moves to
 * its own "Crafted" list rather than sitting in the buy table showing
 * "Covered" for a reason that has nothing to do with the owned-stock ledger.
 */
export function useGroupBuyRows(
  { rollup, builtQuantityByType }: Pick<GroupRollupView, 'rollup' | 'builtQuantityByType'>,
  catalog: BlueprintCatalog
) {
  const { buyRows, craftedTypeIds } = useMemo(() => {
    const buyRows: BuyMaterialRow[] = [];
    const craftedTypeIds: number[] = [];
    for (const line of rollup.tableMaterials) {
      const builtQuantity = builtQuantityByType.get(line.typeID) ?? 0;
      if (builtQuantity > 0 && builtQuantity >= line.quantity) {
        craftedTypeIds.push(line.typeID);
        continue;
      }
      buyRows.push({ ...line, buyToShow: Math.max(0, line.remainingQuantity - builtQuantity) });
    }
    return { buyRows, craftedTypeIds };
  }, [rollup.tableMaterials, builtQuantityByType]);

  // Same rows the buy table itself shows a volume for (issue #874) — a
  // fully crafted material is excluded here for the same reason it never
  // reaches `buyRows`: it is produced inside the group, never hauled.
  const groupVolume = useMemo(
    () => totalVolume(buyRows, (typeID) => volumeForType(catalog, typeID)),
    [buyRows, catalog]
  );

  return { buyRows, craftedTypeIds, groupVolume };
}
