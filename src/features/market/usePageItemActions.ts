import { useEffect, useMemo, useRef, useState } from 'react';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { itemInfoIsUrlBacked, openItemInfo } from '@/stores/itemInfoModal';
import { blueprintTypeIdFor, type ItemActions } from './itemActions';
import { useQuickbar, type Quickbar } from './useQuickbar';

export interface PageItemActionsOptions {
  activeCharacterId: number | null;
  lazyBlueprints?: boolean;
  localInfo?: boolean;
}

export interface ShownItem {
  typeId: number;
  itemName: string;
  itemId?: number;
}

export interface PageItemActions {
  actions: ItemActions;
  quickbar: Quickbar;
  shown: ShownItem | null;
  closeInfo: () => void;
}

export function usePageItemActions({
  activeCharacterId,
  lazyBlueprints = false,
  localInfo = false,
}: PageItemActionsOptions): PageItemActions {
  const quickbar = useQuickbar(activeCharacterId);
  const [shown, setShown] = useState<ShownItem | null>(null);
  const [blueprints, setBlueprints] = useState<BlueprintCatalog | null>(null);
  const requested = useRef(false);

  const latestAdd = useRef(quickbar.add);
  useEffect(() => {
    latestAdd.current = quickbar.add;
  });

  const canAddToQuickbar = quickbar.available;
  const actions = useMemo<ItemActions>(
    () => ({
      canAddToQuickbar,
      addToQuickbar: (typeId, itemName) => latestAdd.current(typeId, itemName),
      showInfo: (typeId, itemName, itemId) => {
        if (!localInfo && itemInfoIsUrlBacked()) openItemInfo(typeId, itemName, itemId);
        else setShown({ typeId, itemName, itemId });
      },
      blueprints,
      blueprintFor: (typeId) => (lazyBlueprints ? blueprintTypeIdFor(blueprints, typeId) : null),
      requestBlueprints: () => {
        if (!lazyBlueprints || requested.current) return;
        requested.current = true;
        void loadBlueprintCatalog()
          .then(setBlueprints)
          .catch(() => {
            requested.current = false;
          });
      },
    }),
    [canAddToQuickbar, blueprints, lazyBlueprints, localInfo]
  );

  return { actions, quickbar, shown, closeInfo: () => setShown(null) };
}
