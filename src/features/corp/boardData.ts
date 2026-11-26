import {
  getCharacterPublicInfo,
  getCorporationMiningExtractions,
  getCorporationStructures,
  type CorporationMiningExtraction,
  type CorporationStructure,
} from '@/esi/endpoints';
import { conditionalPagedFetch, loadWithCacheStatus } from '@/esi/cache';
import type { StatusResult } from '@/esi/cache';
import { recordCharacterCorporation } from '@/auth/session';
import { db } from '@/db';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

export async function loadCorporationId(characterId: number): Promise<number | null> {
  const { cached } = await loadWithCacheStatus<number>(characterId, 'corpIdentity', async () => {
    const info = (await getCharacterPublicInfo(characterId)).data;
    if (info === null) return null;
    try {
      await recordCharacterCorporation(characterId, info.corporation_id);
    } catch {}
    return info.corporation_id;
  });
  if (cached !== null) return cached.data;
  return (await db.characters.get(characterId))?.corporationId ?? null;
}

export function loadCorporationStructures(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationStructure[]>> {
  const { fetchLive, conditional, expiresCapture } = conditionalPagedFetch((options) =>
    getCorporationStructures(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, 'structures', fetchLive, {
    conditional,
    expiresCapture,
  });
}

export function loadCorporationMiningExtractions(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationMiningExtraction[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationMiningExtractions(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(
    characterId,
    corporationId,
    'miningExtractions',
    fetchLive,
    { conditional }
  );
}

export const MASTER_WALLET_DIVISION = 1;
