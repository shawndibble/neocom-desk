/**
 * Item Actions — what an item menu can do on the page it's on: add to the
 * Quickbar, look up the blueprint behind Build Plan, and open the page's one
 * Item Detail modal (Show info). A route builds it once
 * (`usePageItemActions`) and provides it (`ItemActionsProvider`); every item
 * menu and panel reads it here instead of threading five props through each
 * panel (issue #2041).
 */
import { createContext, useContext } from 'react';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';

export interface ItemActions {
  /** False with no active character — the Quickbar has nobody to save the item under. */
  canAddToQuickbar: boolean;
  addToQuickbar: (typeId: number, itemName: string) => void;
  /** Opens the page's Item Detail modal on this item. */
  showInfo: (typeId: number, itemName: string) => void;
  /** The lazily loaded catalog — null until it loads, and always on a page without one. */
  blueprints: BlueprintCatalog | null;
  /**
   * The blueprint that produces `typeId`, in the shape `ItemContextMenu`'s
   * `blueprintTypeID` wants: undefined while the catalog is still to load,
   * null once it has (or on a page without one) and nothing produces it.
   */
  blueprintFor: (typeId: number) => number | null | undefined;
  /** Loads the catalog on first call; a no-op after that and on a page without one. */
  requestBlueprints: () => void;
}

/** `blueprintFor` over a catalog that is null while it hasn't loaded. */
export function blueprintTypeIdFor(
  catalog: BlueprintCatalog | null,
  typeId: number
): number | null | undefined {
  if (catalog === null) return undefined;
  return catalog.byProductTypeID.get(typeId)?.blueprintTypeID ?? null;
}

export const ItemActionsContext = createContext<ItemActions | null>(null);

/** The page's Item Actions. Throws outside an `ItemActionsProvider` — every page with an item menu provides one. */
export function useItemActions(): ItemActions {
  const actions = useContext(ItemActionsContext);
  if (!actions) throw new Error('useItemActions must be used inside an ItemActionsProvider');
  return actions;
}

/** Null outside a provider — for surfaces that also render read-only, without Show info (a shared fit). */
export function useOptionalItemActions(): ItemActions | null {
  return useContext(ItemActionsContext);
}
