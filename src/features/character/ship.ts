/**
 * The hull the active Character is flying, for the D-Scan danger read's
 * "Your ship" default (`esi-location.read_ship_type.v1`, its own Permission
 * `currentShip`).
 *
 * Same stance as `location.ts`: a Character who logged in before the scope
 * existed hasn't granted it, and a 403 there is a missing grant, not a real
 * auth failure, so it must not trip the shell-wide re-auth banner for what is
 * only a convenient default. Only a 401 (or a failed token refresh) counts.
 *
 * Unlike a location, a ship changes when the pilot undocks in another hull, so
 * the freshness window is short (90 s), not the app-wide ten minutes.
 */
import { useEffect, useState } from 'react';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { AuthError } from '@/auth/sso';
import { loadWithCache } from '@/esi/cache';
import { EsiError } from '@/esi/client';
import { getCharacterShip } from '@/esi/endpoints';
import { requiredScopesForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';

const CACHE_KEY = 'characterShip';
export const SHIP_STALE_AFTER_MS = 90_000;
const SHIP_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterShip'];

/** The type id of the ship the character is flying, or null if unresolvable (missing grant, offline, or uncached). */
export async function loadCharacterShipTypeId(characterId: number): Promise<number | null> {
  const result = await loadWithCache(
    characterId,
    CACHE_KEY,
    async () => (await getCharacterShip(characterId)).data?.ship_type_id ?? null,
    {
      staleAfterMs: SHIP_STALE_AFTER_MS,
      detectAuthFailure: (err) =>
        err instanceof AuthError || (err instanceof EsiError && err.status === 401),
    }
  );
  return result?.data ?? null;
}

export type CharacterShipStatus = 'loading' | 'ready' | 'needsScope' | 'unavailable';

export interface CharacterShipState {
  typeId: number | null;
  status: CharacterShipStatus;
}

/**
 * The active Character's current ship type. `needsScope` when the stored grant
 * lacks the scope (the caller offers the existing Grant flow and falls back to
 * a manual pick); `unavailable` when the call came back empty (offline, error).
 */
export function useCharacterShipTypeId(): CharacterShipState {
  const characterId = useActiveCharacter((s) => (s.hydrated ? s.activeCharacterId : null));
  // `undefined` until the stored grant has been read: hold the fetch back
  // until then, or an ungranted Character would spend a call on a 403.
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
