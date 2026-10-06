/**
 * The app-wide Item Detail (Show info) for `?info=type-<typeId>`, mounted once
 * in `App.tsx` like `SkillDetailModal`: any item name can link to it
 * (`ItemInfoLink`) without its page owning an Item Detail host. The
 * Item Detail chunk loads on first open. Opened from a link the name is
 * staged; from a pasted URL it is looked up off the type.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { guarded } from '@/app/routeChunks';
import { loadTypeName } from '@/features/character/typeNames';
import { ItemActionsContext } from '@/features/market/itemActions';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useItemInfoModalStore } from '@/stores/itemInfoModal';

const ItemDetailModal = lazy(() =>
  guarded(() => import('@/features/market/ItemDetailModal')).then((module) => ({
    default: module.ItemDetailModal,
  }))
);

export function ItemInfoModal() {
  const open = useItemInfoModalStore((state) => state.request !== null);
  return open ? <ItemInfoHost /> : null;
}

/** Mounted only while open: it brings the page-less Item Actions Used-in's menus need. */
function ItemInfoHost() {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const { actions } = usePageItemActions({ activeCharacterId, lazyBlueprints: true });
  const request = useItemInfoModalStore((state) => state.request);
  const close = useItemInfoModalStore((state) => state.close);
  const clear = useItemInfoModalStore((state) => state.clear);
  const [looked, setLooked] = useState<{ typeId: number; name: string } | null>(null);
  const typeId = request?.typeId ?? null;
  const needsLookup = request !== null && !request.itemName;

  useEffect(() => {
    if (typeId === null || !needsLookup) return;
    let cancelled = false;
    void loadTypeName(typeId)
      .catch(() => `Type #${typeId}`)
      .then((name) => {
        if (!cancelled) setLooked({ typeId, name });
      });
    return () => {
      cancelled = true;
    };
  }, [typeId, needsLookup]);

  if (!request) return null;
  const name = request.itemName ?? (looked?.typeId === request.typeId ? looked.name : null);
  if (name === null) return null;
  return (
    <ItemActionsContext.Provider value={actions}>
      <Suspense fallback={null}>
        <ItemDetailModal
          key={request.typeId}
          typeId={request.typeId}
          itemName={name}
          showOpenInMarket
          onClose={close}
          onLeave={clear}
        />
      </Suspense>
    </ItemActionsContext.Provider>
  );
}
