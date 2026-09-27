/**
 * Builds a page's Item Actions (see `itemActions.ts`). The route calls this
 * once and hands the result to `ItemActionsProvider`; it also keeps what the
 * route itself still needs — the full Quickbar for reorder/remove/bulk add,
 * and the catalog for its own blueprint checks.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { blueprintTypeIdFor, type ItemActions } from './itemActions';
import { useQuickbar, type Quickbar } from './useQuickbar';

export interface PageItemActionsOptions {
  activeCharacterId: number | null;
  /**
   * Loads the blueprint catalog on the first item-menu open rather than on
   * mount — it pulls the full SDE types.json, which CONTEXT.md keeps out of
   * the install precache (Market, Assets). Pages without it either have their
   * catalog already or offer no Build Plan: their menus say which blueprint
   * directly, or "No blueprint options".
   */
  lazyBlueprints?: boolean;
}

export interface ShownItem {
  typeId: number;
  itemName: string;
}

export interface PageItemActions {
  /** What the page provides to its item menus. */
  actions: ItemActions;
  /** The whole Quickbar, for the page's own reorder/remove/bulk-add writes. */
  quickbar: Quickbar;
  /** The item the Item Detail modal is open on, if any. */
  shown: ShownItem | null;
  closeInfo: () => void;
}

export function usePageItemActions({
  activeCharacterId,
  lazyBlueprints = false,
}: PageItemActionsOptions): PageItemActions {
  const quickbar = useQuickbar(activeCharacterId);
  const [shown, setShown] = useState<ShownItem | null>(null);
  const [blueprints, setBlueprints] = useState<BlueprintCatalog | null>(null);
  const requested = useRef(false);

  // `quickbar.add` closes over the current items, so menus read it through a
  // ref: the provided value then changes only when what a menu shows does,
  // not on every Quickbar write (the per-row concern `PriceAlertDialog` notes).
  const latestAdd = useRef(quickbar.add);
  useEffect(() => {
    latestAdd.current = quickbar.add;
  });

  const canAddToQuickbar = quickbar.available;
  const actions = useMemo<ItemActions>(
    () => ({
      canAddToQuickbar,
      addToQuickbar: (typeId, itemName) => latestAdd.current(typeId, itemName),
      showInfo: (typeId, itemName) => setShown({ typeId, itemName }),
      blueprints,
      blueprintFor: (typeId) => (lazyBlueprints ? blueprintTypeIdFor(blueprints, typeId) : null),
      requestBlueprints: () => {
        if (!lazyBlueprints || requested.current) return;
        requested.current = true;
        void loadBlueprintCatalog()
          .then(setBlueprints)
          .catch(() => {
            // Build Plan degrades to "No blueprint options" on failure — not core functionality.
          });
      },
    }),
    [canAddToQuickbar, blueprints, lazyBlueprints]
  );

  return { actions, quickbar, shown, closeInfo: () => setShown(null) };
}
