import { useEffect, useState } from 'react';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { loadWithCache } from '@/esi/cache';
import { isCredentialFailure } from '@/esi/client';
import { getCharacterShip, type CharacterShip } from '@/esi/endpoints';
import { requiredScopesForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';

const CACHE_KEY = 'characterShip:full';
export const SHIP_STALE_AFTER_MS = 90_000;
const SHIP_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterShip'];

export interface ShipTypeRead {
  typeId: number | null;
  fetchedAt: Date | null;
}

function loadShipRow(characterId: number) {
  return loadWithCache(
    characterId,
    CACHE_KEY,
    async () => (await getCharacterShip(characterId)).data ?? null,
    {
      staleAfterMs: SHIP_STALE_AFTER_MS,
      detectAuthFailure: isCredentialFailure,
    }
  );
}

export async function loadCharacterShipTypeRead(characterId: number): Promise<ShipTypeRead> {
  const result = await loadShipRow(characterId);
  return { typeId: result?.data?.ship_type_id ?? null, fetchedAt: result?.fetchedAt ?? null };
}

export async function loadCharacterShip(characterId: number): Promise<CharacterShip | null> {
  return (await loadShipRow(characterId))?.data ?? null;
}

export async function loadCharacterShipTypeId(characterId: number): Promise<number | null> {
  return (await loadCharacterShipTypeRead(characterId)).typeId;
}

export type CharacterShipStatus = 'loading' | 'ready' | 'needsScope' | 'unavailable';

export interface CharacterShipState {
  typeId: number | null;
  status: CharacterShipStatus;
}

export function useCharacterShipTypeId(): CharacterShipState {
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  const granted = useGrantedScopes();
  const lacksScope =
    granted !== undefined &&
    !requiredScopesForEndpoints(SHIP_ENDPOINTS).every((s) => granted.includes(s));
  const grantKnown = granted !== undefined;
  const [loaded, setLoaded] = useState<{ characterId: number; typeId: number | null } | null>(null);

  useEffect(() => {
    if (characterId === null || !grantKnown || lacksScope) return;
    let cancelled = false;
    loadCharacterShipTypeId(characterId)
      .catch(() => null)
      .then((typeId) => {
        if (!cancelled) setLoaded({ characterId, typeId });
      });
    return () => {
      cancelled = true;
    };
  }, [characterId, grantKnown, lacksScope]);

  if (characterId === null) return { typeId: null, status: 'unavailable' };
  if (lacksScope) return { typeId: null, status: 'needsScope' };
  if (loaded?.characterId !== characterId) return { typeId: null, status: 'loading' };
  return loaded.typeId === null
    ? { typeId: null, status: 'unavailable' }
    : { typeId: loaded.typeId, status: 'ready' };
}
