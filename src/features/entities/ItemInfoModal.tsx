/**
 * The app-wide Item Detail (Show info) for `?info=type-<typeId>`, mounted once
 * in `App.tsx` like `SkillDetailModal`: any item name can link to it
 * (`ItemInfoLink`) without its page owning an Item Detail host. The
 * Item Detail chunk loads on first open. Opened from a link the name is
 * staged; from a pasted URL it is looked up off the type.
 */
import { Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { lazyNamed } from '@/app/lazyNamed';
import { loadTypeName } from '@/features/character/typeNames';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { ItemActionsContext } from '@/features/market/itemActions';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useItemInfoModalStore } from '@/stores/itemInfoModal';

const ItemDetailModal = lazyNamed(
  () => import('@/features/market/ItemDetailModal'),
  'ItemDetailModal'
);

export function ItemInfoModal() {
  const open = useItemInfoModalStore((state) => state.request !== null);
  return open ? <ItemInfoHost /> : null;
}

/** Mounted only while open: it brings the page-less Item Actions Used-in's menus need. */
function ItemInfoHost() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const { actions } = usePageItemActions({ activeCharacterId, lazyBlueprints: true });
  const request = useItemInfoModalStore((state) => state.request);
  const close = useItemInfoModalStore((state) => state.close);
  const clear = useItemInfoModalStore((state) => state.clear);
  const typeId = request?.typeId ?? null;
  const needsLookup = request !== null && !request.itemName;

  const lookup = useCallback(
    () => loadTypeName(typeId ?? 0).catch(() => t('common.unknownType', { typeId })),
    [typeId, t]
  );
  const { data: looked } = useKeyedLoad(
    typeId === null ? null : String(typeId),
    lookup,
    !needsLookup
  );

  if (!request) return null;
  const name = request.itemName ?? looked ?? null;
  if (name === null) return null;
  return (
    <ItemActionsContext.Provider value={actions}>
      <Suspense fallback={null}>
        <ItemDetailModal
          key={`${request.typeId}-${request.itemId ?? ''}`}
          typeId={request.typeId}
          itemId={request.itemId}
          itemName={name}
          showOpenInMarket
          onClose={close}
          onLeave={clear}
        />
      </Suspense>
    </ItemActionsContext.Provider>
  );
}
