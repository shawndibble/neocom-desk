import { getCharacterLocation } from '@/esi/endpoints';
import { isCredentialFailure } from '@/esi/client';
import { loadWithCache } from '@/esi/cache';

const LOCATION_FRESH_MS = 5_000;

function cacheKey(): string {
  return 'characterLocation';
}

export interface SolarSystemRead {
  systemId: number | null;
  fetchedAt: Date | null;
}

export async function loadCharacterSolarSystemRead(
  characterId: number,
  staleAfterMs: number = LOCATION_FRESH_MS
): Promise<SolarSystemRead> {
  const result = await loadWithCache(
    characterId,
    cacheKey(),
    async () => (await getCharacterLocation(characterId)).data?.solar_system_id ?? null,
    {
      detectAuthFailure: isCredentialFailure,
      staleAfterMs,
    }
  );
  return { systemId: result?.data ?? null, fetchedAt: result?.fetchedAt ?? null };
}

export async function loadCharacterSolarSystemId(
  characterId: number,
  staleAfterMs?: number
): Promise<number | null> {
  return (await loadCharacterSolarSystemRead(characterId, staleAfterMs)).systemId;
}

export interface CharacterPlace {
  systemId: number;
  stationId: number | null;
  structureId: number | null;
}

export interface PlaceRead {
  place: CharacterPlace | null;
  fetchedAt: Date | null;
}

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
