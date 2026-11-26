import { Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { lazyNamed } from '@/app/lazyNamed';
import { loadTypeName } from '@/features/character/typeNames';
import { unnamedTypeName } from '@/features/fittings/useFittingCatalogue';
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

function ItemInfoHost() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const { actions } = usePageItemActions({ activeCharacterId, lazyBlueprints: true });
  const request = useItemInfoModalStore((state) => state.request);
  const close = useItemInfoModalStore((state) => state.close);
  const clear = useItemInfoModalStore((state) => state.clear);
  const typeId = request?.typeId ?? null;
  const needsLookup =
    request !== null && (!request.itemName || request.itemName === unnamedTypeName(request.typeId));

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
  const name = needsLookup ? (looked ?? request.itemName ?? null) : (request.itemName ?? null);
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
