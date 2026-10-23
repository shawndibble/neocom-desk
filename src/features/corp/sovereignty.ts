/**
 * Fetch + cache layer for the corporation's skyhooks and sovereignty hubs
 * (issue #4775): a list read, then one detail read per structure for its
 * raid window and reagents. Corp-keyed through `corpRead.ts`; the details fan
 * out under `ESI_FANOUT_CONCURRENCY`. A structure whose detail cannot be read
 * is unknown, never safe.
 */
import { conditionalFetch, type StatusResult } from '@/esi/cache';
import type { EsiResult } from '@/esi/client';
import {
  getCorporationSkyhook,
  getCorporationSkyhooks,
  getCorporationSovereigntyHub,
  getCorporationSovereigntyHubs,
  type CorporationSkyhookDetail,
  type CorporationSovereigntyHubDetail,
} from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadCorpWithCacheStatus } from './corpRead';

export type SkyhookList = { skyhooks: { id: number; planet_id: number }[] };
export type HubList = { sovereignty_hubs: { id: number; solar_system_id: number }[] };

export function loadCorporationSkyhooks(
  characterId: number,
  corporationId: number
): Promise<StatusResult<SkyhookList>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationSkyhooks(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, 'skyhooks', fetchLive, {
    conditional,
  });
}

export function loadCorporationSovereigntyHubs(
  characterId: number,
  corporationId: number
): Promise<StatusResult<HubList>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationSovereigntyHubs(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, 'sovereigntyHubs', fetchLive, {
    conditional,
  });
}

/** Detail for each id, concurrency-capped; keyed by structure id. */
async function loadDetails<T>(
  ids: readonly number[],
  keyOf: (id: number) => string,
  fetchOne: (id: number, options: { etag?: string }) => Promise<EsiResult<T>>,
  characterId: number,
  corporationId: number
): Promise<Map<number, StatusResult<T>>> {
  const results = new Map<number, StatusResult<T>>();
  await mapWithConcurrencyLimit(ids, ESI_FANOUT_CONCURRENCY, async (id) => {
    const { fetchLive, conditional } = conditionalFetch((options) => fetchOne(id, options));
    results.set(
      id,
      await loadCorpWithCacheStatus(characterId, corporationId, keyOf(id), fetchLive, {
        conditional,
      })
    );
  });
  return results;
}

export function loadSkyhookDetails(
  characterId: number,
  corporationId: number,
  ids: readonly number[]
): Promise<Map<number, StatusResult<CorporationSkyhookDetail>>> {
  return loadDetails<CorporationSkyhookDetail>(
    ids,
    (id) => `skyhook:${id}`,
    (id, options) => getCorporationSkyhook(characterId, corporationId, id, options),
    characterId,
    corporationId
  );
}

export function loadHubDetails(
  characterId: number,
  corporationId: number,
  ids: readonly number[]
): Promise<Map<number, StatusResult<CorporationSovereigntyHubDetail>>> {
  return loadDetails<CorporationSovereigntyHubDetail>(
    ids,
    (id) => `sovHub:${id}`,
    (id, options) => getCorporationSovereigntyHub(characterId, corporationId, id, options),
    characterId,
    corporationId
  );
}
