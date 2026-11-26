import { createContext, useContext } from 'react';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';

export interface ItemActions {
  canAddToQuickbar: boolean;
  addToQuickbar: (typeId: number, itemName: string) => void;
  showInfo: (typeId: number, itemName: string, itemId?: number) => void;
  blueprints: BlueprintCatalog | null;
  blueprintFor: (typeId: number) => number | null | undefined;
  requestBlueprints: () => void;
}

export function blueprintTypeIdFor(
  catalog: BlueprintCatalog | null,
  typeId: number
): number | null | undefined {
  if (catalog === null) return undefined;
  return catalog.byProductTypeID.get(typeId)?.blueprintTypeID ?? null;
}

export const ItemActionsContext = createContext<ItemActions | null>(null);

export function useItemActions(): ItemActions {
  const actions = useContext(ItemActionsContext);
  if (!actions) throw new Error('useItemActions must be used inside an ItemActionsProvider');
  return actions;
}

export function useOptionalItemActions(): ItemActions | null {
  return useContext(ItemActionsContext);
}
