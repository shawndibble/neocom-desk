/**
 * Fetch + cache layer for the corporation's starbases (issue #4610): the tower
 * list, and one detail read per online tower for its fuel and strontium.
 *
 * Corp-keyed and corp-auth-aware through `corpRead.ts`, like every corp read.
 * The detail call is per tower (and takes the tower's system), so it fans out
 * under `ESI_FANOUT_CONCURRENCY`. A tower whose detail cannot be read is
 * unknown, never empty.
 */
import { conditionalFetch, conditionalPagedFetch, type StatusResult } from '@/esi/cache';
import {
  getCorporationStarbase,
  getCorporationStarbases,
  type CorporationStarbase,
  type CorporationStarbaseDetail,
} from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadCorpPaginatedWithCacheStatus, loadCorpWithCacheStatus } from './corpRead';

const LIST_KEY = 'starbases';
const detailKey = (starbaseId: number) => `starbase:${starbaseId}`;

/** The corporation's starbases, any state. ESI or cache. */
export function loadCorporationStarbases(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationStarbase[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationStarbases(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, LIST_KEY, fetchLive, {
    conditional,
  });
}

export function loadCorporationStarbase(
  characterId: number,
  corporationId: number,
  starbase: Pick<CorporationStarbase, 'starbase_id' | 'system_id'>
): Promise<StatusResult<CorporationStarbaseDetail>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationStarbase(
      characterId,
      corporationId,
      starbase.starbase_id,
      starbase.system_id,
      options
    )
  );
  return loadCorpWithCacheStatus(
    characterId,
    corporationId,
    detailKey(starbase.starbase_id),
    fetchLive,
    { conditional }
  );
}

/** Detail for each listed tower, concurrency-capped; keyed by starbase id. */
export async function loadStarbaseDetails(
  characterId: number,
  corporationId: number,
  starbases: readonly Pick<CorporationStarbase, 'starbase_id' | 'system_id'>[]
): Promise<Map<number, StatusResult<CorporationStarbaseDetail>>> {
  const results = new Map<number, StatusResult<CorporationStarbaseDetail>>();
  await mapWithConcurrencyLimit(starbases, ESI_FANOUT_CONCURRENCY, async (starbase) => {
    results.set(
      starbase.starbase_id,
      await loadCorporationStarbase(characterId, corporationId, starbase)
    );
  });
  return results;
}
