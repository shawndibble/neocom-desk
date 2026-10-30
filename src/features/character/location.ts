/**
 * Active character's current solar system, for jumps-away distances (first
 * the Assets page, issue #87): fetched on each page load via ESI, never polled.
 * Every page that measures from it (route, market, assets, PI...) asks on
 * load, and the row is only fresh for a 5 s TTL (ESI's own cache), so opening a
 * page minutes later reads where the pilot is now, not where they were.
 *
 * `esi-location.read_location.v1` was added to the registry alongside this
 * loader, so a character who logged in before it existed hasn't granted it
 * yet — a 403 here is exactly `structures.ts`'s "not on the ACL" situation,
 * not a real auth failure, so it must not trip the shell-wide re-auth banner
 * for what is only a secondary enhancement to the page. Only a 401 (or a
 * failed token refresh) counts.
 */
import { getCharacterLocation } from '@/esi/endpoints';
import { isCredentialFailure } from '@/esi/client';
import { loadWithCache } from '@/esi/cache';

/** A 5 s TTL matching ESI's cache on /location; `STALE_AFTER.default` would serve a stale system. */
const LOCATION_FRESH_MS = 5_000;

function cacheKey(): string {
  return 'characterLocation';
}

/** A read of the current solar system, with when ESI last said so. */
export interface SolarSystemRead {
  systemId: number | null;
  /** The cached row's own age (a cache hit is older than the call); null when nothing was read. */
  fetchedAt: Date | null;
}

export async function loadCharacterSolarSystemRead(characterId: number): Promise<SolarSystemRead> {
  const result = await loadWithCache(
    characterId,
    cacheKey(),
    async () => (await getCharacterLocation(characterId)).data?.solar_system_id ?? null,
    {
      detectAuthFailure: isCredentialFailure,
      staleAfterMs: LOCATION_FRESH_MS,
    }
  );
  return { systemId: result?.data ?? null, fetchedAt: result?.fetchedAt ?? null };
}

/** The character's current solar system id, or null if unresolvable (missing grant, offline, or uncached). */
export async function loadCharacterSolarSystemId(characterId: number): Promise<number | null> {
  return (await loadCharacterSolarSystemRead(characterId)).systemId;
}

/** Where a character is: the solar system, plus the station or structure when docked. */
export interface CharacterPlace {
  systemId: number;
  stationId: number | null;
  structureId: number | null;
}

/** A read of the full location, with when ESI last said so. */
export interface PlaceRead {
  place: CharacterPlace | null;
  fetchedAt: Date | null;
}

/**
 * The same `/location` read as `loadCharacterSolarSystemRead`, keeping the
 * docked station or structure too. Its own cache key: the system-only row
 * stores a bare number and other pages already read it.
 */
export async function loadCharacterPlaceRead(characterId: number): Promise<PlaceRead> {
  const result = await loadWithCache(
    characterId,
    'characterPlace',
    async (): Promise<CharacterPlace | null> => {
      const data = (await getCharacterLocation(characterId)).data;
      if (!data) return null;
      return {
        systemId: data.solar_system_id,
        stationId: data.station_id ?? null,
        structureId: data.structure_id ?? null,
      };
    },
    {
      detectAuthFailure: isCredentialFailure,
      staleAfterMs: LOCATION_FRESH_MS,
    }
  );
  return { place: result?.data ?? null, fetchedAt: result?.fetchedAt ?? null };
}
