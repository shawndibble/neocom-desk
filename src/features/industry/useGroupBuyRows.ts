import { useMemo } from 'react';
import { totalVolume } from '@/engine/industry/materialVolume';
import type { MaterialCostLine } from '@/engine/industry/types';
import { volumeForType, type BlueprintCatalog } from './blueprintCatalog';
import type { GroupRollupView } from './groupRollupView';

export type BuyMaterialRow = MaterialCostLine & { buyToShow: number };

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

  const groupVolume = useMemo(
    () => totalVolume(buyRows, (typeID) => volumeForType(catalog, typeID)),
    [buyRows, catalog]
  );

  return { buyRows, craftedTypeIds, groupVolume };
}
