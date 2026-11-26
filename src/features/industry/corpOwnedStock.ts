import { useCallback, useEffect } from 'react';
import type { OwnedStockSource } from '@/engine/industry/ownedStock';
import { loadCorporationAssets } from '@/features/corp/assets';
import { useActiveCorporationId } from '@/features/corp/owner';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';

export interface CorpOwnedStockResult {
  source: OwnedStockSource;
  truncated: boolean;
}

export async function loadCorpOwnedStockSource(
  characterId: number,
  corporationId: number
): Promise<CorpOwnedStockResult | null> {
  const { cached } = await loadCorporationAssets(characterId, corporationId);
  if (!cached) return null;
  return {
    source: { characterId, corporationId, assets: cached.data },
    truncated: cached.truncated,
  };
}

export interface CorpOwnedStockState {
  source: OwnedStockSource | null;
  corporationId: number | null;
  corporationName: string | null;
  available: boolean;
  incomplete: boolean;
}

const UNAVAILABLE: CorpOwnedStockState = {
  source: null,
  corporationId: null,
  corporationName: null,
  available: false,
  incomplete: false,
};

export function useCorpOwnedStockSource(): CorpOwnedStockState {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const access = useCorpAccess();
  const canReadAssets = access.state === 'ready' && access.capabilities.canReadAssets;
  const loadPublicInfo = usePublicInfo((state) => state.load);
  const corporationName = usePublicInfo((state) =>
    activeCharacterId === null
      ? null
      : (state.byCharacterId[activeCharacterId]?.corporationName ?? null)
  );

  const available = canReadAssets && activeCharacterId !== null && corporationId !== null;

  useEffect(() => {
    if (activeCharacterId !== null) void loadPublicInfo(activeCharacterId);
  }, [activeCharacterId, loadPublicInfo]);

  const loader = useCallback(
    () => loadCorpOwnedStockSource(activeCharacterId ?? 0, corporationId ?? 0).catch(() => null),
    [activeCharacterId, corporationId]
  );
  const { data } = useKeyedLoad(available ? `${activeCharacterId}:${corporationId}` : null, loader);

  if (!available) return UNAVAILABLE;

  const result = data ?? null;

  return {
    source: result?.source ?? null,
    corporationId,
    corporationName,
    available: true,
    incomplete: result?.truncated ?? false,
  };
}
