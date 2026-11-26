import { useCallback, useState } from 'react';
import {
  GAS_DECOMPRESSION_YIELD,
  compareGasRoute,
  compressGasLines,
} from '@/engine/industry/compressedGas';
import { blueprintsLeftOutCount, shoppingListText } from '@/engine/industry/shoppingList';
import { loadTypeNames, loadTypeVolumes } from '@/features/character/typeNames';
import { writeToClipboard } from '@/lib/clipboard';
import { useAsyncLoad, useKeyedLoad } from '@/lib/useAsyncLoad';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import type { TradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadCompressedGasTypeIds } from '@/sde/loadSde';
import { nameForType, type BlueprintCatalog } from './blueprintCatalog';
import type { usePlanMaterials } from './usePlanMaterials';

export function useShoppingListCopy(
  hasResult: boolean,
  shoppingMaterials: ReturnType<typeof usePlanMaterials>['shoppingMaterials'],
  catalog: BlueprintCatalog,
  hub: TradeHub
) {
  const { copied: copyState, flash: flashCopy } = useCopyFeedback<'copied' | 'failed'>(2000);
  const [blueprintsLeftOut, setBlueprintsLeftOut] = useState(0);
  const [compressedGasChoice, setCompressedGas] = useState(false);
  const gasMap = useAsyncLoad(loadCompressedGasTypeIds).data;
  const hasGas =
    !!gasMap && shoppingMaterials.some((m) => m.remainingQuantity > 0 && gasMap[m.typeID]);
  const compressedGas = compressedGasChoice && hasGas;

  const loadGasRoute = useCallback(async () => {
    if (!gasMap) return null;
    const ids = shoppingMaterials.flatMap((m) =>
      gasMap[m.typeID] ? [m.typeID, gasMap[m.typeID]!] : []
    );
    const [prices, volumes] = await Promise.all([getHubPrices(hub, ids), loadTypeVolumes(ids)]);
    const sellPrices: Record<number, number> = {};
    for (const id of ids) {
      const price = prices.get(id)?.sellMin;
      if (price && price > 0) sellPrices[id] = price;
    }
    return compareGasRoute(
      shoppingMaterials,
      gasMap,
      GAS_DECOMPRESSION_YIELD,
      sellPrices,
      Object.fromEntries(volumes)
    );
  }, [gasMap, shoppingMaterials, hub]);
  const gasKey = shoppingMaterials
    .filter((m) => gasMap?.[m.typeID])
    .map((m) => `${m.typeID}:${m.remainingQuantity}`)
    .join(',');
  const gasRoute = useKeyedLoad(compressedGas ? `${hub.id}|${gasKey}` : null, loadGasRoute);

  async function copyShoppingList() {
    if (!hasResult) return;
    try {
      let materials = shoppingMaterials;
      let nameFor = (id: number) => nameForType(catalog, id);
      if (compressedGas && gasMap) {
        materials = compressGasLines(materials, gasMap, GAS_DECOMPRESSION_YIELD);
        const names = await loadTypeNames(Object.values(gasMap));
        nameFor = (id) => names.get(id) ?? nameForType(catalog, id);
      }
      await writeToClipboard(shoppingListText(materials, nameFor));
      flashCopy('copied');
      setBlueprintsLeftOut(blueprintsLeftOutCount(shoppingMaterials));
    } catch {
      flashCopy('failed');
    }
  }

  return {
    copyState,
    blueprintsLeftOut,
    copyShoppingList,
    hasGas,
    compressedGas,
    setCompressedGas,
    gasComparison: gasRoute.data ?? null,
    shoppingMaterials,
  };
}
