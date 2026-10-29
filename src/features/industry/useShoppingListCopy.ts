import { useState } from 'react';
import { blueprintsLeftOutCount, shoppingListText } from '@/engine/industry/shoppingList';
import { writeToClipboard } from '@/lib/clipboard';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
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
 */
export function useShoppingListCopy(
  hasResult: boolean,
  shoppingMaterials: ReturnType<typeof usePlanMaterials>['shoppingMaterials'],
  catalog: BlueprintCatalog
) {
  const { copied: copyState, flash: flashCopy } = useCopyFeedback<'copied' | 'failed'>(2000);
  const [blueprintsLeftOut, setBlueprintsLeftOut] = useState(0);

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
      await writeToClipboard(shoppingListText(shoppingMaterials, (id) => nameForType(catalog, id)));
      flashCopy('copied');
      // Multibuy can't buy a blueprint (issue #1778) — shoppingListText already
      // dropped it; name the count so the pilot knows to buy it by contract.
      setBlueprintsLeftOut(blueprintsLeftOutCount(shoppingMaterials));
    } catch {
      flashCopy('failed');
    }
  }

  return { copyState, blueprintsLeftOut, copyShoppingList };
}
