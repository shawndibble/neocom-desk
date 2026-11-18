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

/**
 * The Materials panel's shopping-list copy: puts the plan's outstanding
 * materials on the clipboard as multibuy text, so the whole run can be ordered
 * in one paste in-game.
 *
 * `copyState` is what the shopping-list button says right now. A clipboard
 * write leaves nothing on screen to look at, so the control has to report
 * itself — `null` is the resting label, and the other two states replace it
 * for a moment. Same beside-the-control confirmation the skill planner's
 * export uses, in the one form a toolbar IconButton has: its own icon and
 * label. `blueprintsLeftOut` counts the Blueprint Acquisition rows (issue
 * #838) `shoppingListText` just left out of a successful copy.
 *
 * Buying gas compressed (issue #6395) is a per-visit toggle, off by default:
 * on, the copied list names the compressed gas, sized so decompressing it
 * returns the raw quantity the plan needs, and `gasComparison` carries the
 * raw-versus-compressed price and haul the pilot is trading. `hasGas` says
 * whether the plan has any gas to offer the toggle for.
 */
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
  // Keyed on the hub and the gas quantities: the comparison belongs to one
  // shopping list, so a changed requirement must not keep the old totals on
  // screen. Only fetched while the toggle is on.
  const gasKey = shoppingMaterials
    .filter((m) => gasMap?.[m.typeID])
    .map((m) => `${m.typeID}:${m.remainingQuantity}`)
    .join(',');
  const gasRoute = useKeyedLoad(compressedGas ? `${hub.id}|${gasKey}` : null, loadGasRoute);

  /**
   * The rejection is caught and shown, not left to `void`: a browser that
   * denies clipboard access (permission refused, or a page that lost focus
   * between the click and the write) is a real path, and the same silent
   * failure on the read side is already surfaced by ImportClipboardDialog.
   */
  async function copyShoppingList() {
    if (!hasResult) return;
    try {
      // The flattened leaf list, not the plan's own: a material being
      // produced here is not something to order, and the recipe inputs that
      // replaced it are — however many levels down they sit.
      let materials = shoppingMaterials;
      let nameFor = (id: number) => nameForType(catalog, id);
      if (compressedGas && gasMap) {
        materials = compressGasLines(shoppingMaterials, gasMap, GAS_DECOMPRESSION_YIELD);
        // The compressed twins are not blueprint materials, so the catalog
        // does not know their names.
        const names = await loadTypeNames(Object.values(gasMap));
        nameFor = (id) => names.get(id) ?? nameForType(catalog, id);
      }
      await writeToClipboard(shoppingListText(materials, nameFor));
      flashCopy('copied');
      // Multibuy can't buy a blueprint (issue #1778) — shoppingListText already
      // dropped it; name the count so the pilot knows to buy it by contract.
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
  };
}
