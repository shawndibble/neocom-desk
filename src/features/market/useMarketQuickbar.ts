/**
 * The Market page's Quickbar and Compare Set actions that offer an Undo: the
 * Remove-with-Undo toast, reorder, the Variations "Compare" merge with its
 * own Undo toast, and each pinned item's hub price against what was paid.
 */
import { useMemo, useState } from 'react';
import type { QuickbarItem } from '@/db';
import type { TradeHub } from '@/market/hubs';
import type { MarketTypeEntry } from '@/sde/marketTypes';
import { useCompareSet } from '@/features/market/compareSet';
import { useQuickbarVsPaid } from '@/features/market/useQuickbarVsPaid';
import {
  removeQuickbarItem,
  restoreQuickbarItem,
  reorderQuickbarItems,
} from '@/features/market/quickbar';

export interface UseMarketQuickbarArgs {
  activeCharacterId: number | null;
  quickbarItems: readonly QuickbarItem[];
  writeQuickbar: (items: QuickbarItem[]) => Promise<unknown> | void;
  effectiveHub: TradeHub;
  selectedTypeId: number | null;
  selectedItem: MarketTypeEntry | null;
  /** The Variations table's rows, which "Compare" merges into the Compare Set. */
  variationRows: readonly { typeId: number; name: string }[] | null;
}

export function useMarketQuickbar({
  activeCharacterId,
  quickbarItems,
  writeQuickbar,
  effectiveHub,
  selectedTypeId,
  selectedItem,
  variationRows,
}: UseMarketQuickbarArgs) {
  // Remove keeps the row and its slot so the Undo toast can put it back.
  const [quickbarUndo, setQuickbarUndo] = useState<{
    item: QuickbarItem;
    index: number;
    characterId: number;
  } | null>(null);
  function handleRemoveFromQuickbar(typeId: number) {
    const index = quickbarItems.findIndex((i) => i.typeId === typeId);
    if (index === -1) return;
    if (activeCharacterId !== null) {
      setQuickbarUndo({ item: quickbarItems[index], index, characterId: activeCharacterId });
    }
    void writeQuickbar(removeQuickbarItem(quickbarItems, typeId));
  }
  function handleUndoQuickbarRemove() {
    if (!quickbarUndo || quickbarUndo.characterId !== activeCharacterId) return;
    void writeQuickbar(restoreQuickbarItem(quickbarItems, quickbarUndo.item, quickbarUndo.index));
    setQuickbarUndo(null);
  }
  function handleReorderQuickbar(activeTypeId: number, overTypeId: number) {
    void writeQuickbar(reorderQuickbarItems(quickbarItems, activeTypeId, overTypeId));
  }

  // Variations "Compare" (issue #146, folded into the Compare drawer's
  // Attributes view by #1425): adds every row currently shown in the
  // Variations table, plus the selected item itself, to the Compare Set and
  // opens the drawer on Attributes — see CompareAttributesMatrix.
  const addManyToCompare = useCompareSet((state) => state.addMany);
  const removeManyFromCompare = useCompareSet((state) => state.removeMany);
  const openCompareIn = useCompareSet((state) => state.openIn);
  // Issue #1746: the merge can add ~19 rows with no cheap way back out, so
  // the add is followed by an Undo toast that removes exactly those rows.
  const [compareUndo, setCompareUndo] = useState<{
    typeIds: number[];
    count: number;
    itemName: string;
  } | null>(null);
  function handleCompareVariations() {
    if (!variationRows || !selectedItem || selectedTypeId === null) return;
    const added = addManyToCompare([
      { typeId: selectedTypeId, itemName: selectedItem.name },
      ...variationRows.map((row) => ({ typeId: row.typeId, itemName: row.name })),
    ]);
    openCompareIn('attributes');
    setCompareUndo(
      added.length > 0 ? { typeIds: added, count: added.length, itemName: selectedItem.name } : null
    );
  }
  function handleUndoCompareVariations() {
    if (!compareUndo) return;
    removeManyFromCompare(compareUndo.typeIds);
    setCompareUndo(null);
  }

  // Issue #5333: each pinned item's hub price against what the wallet says was paid.
  const quickbarTypeIds = useMemo(() => quickbarItems.map((i) => i.typeId), [quickbarItems]);
  const quickbarVsPaid = useQuickbarVsPaid(activeCharacterId, quickbarTypeIds, effectiveHub);

  return {
    quickbarUndo,
    compareUndo,
    quickbarVsPaid,
    handleRemoveFromQuickbar,
    handleUndoQuickbarRemove,
    handleReorderQuickbar,
    handleCompareVariations,
    handleUndoCompareVariations,
    dismissQuickbarUndo: () => setQuickbarUndo(null),
    dismissCompareUndo: () => setCompareUndo(null),
  };
}
