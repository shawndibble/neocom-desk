/**
 * Fetch + cache layer for the corporation's customs offices (issue #4611).
 * Same shape as `jobs.ts`: corp-keyed cache, corp-aware 403 handling.
 */
import { conditionalPagedFetch } from '@/esi/cache';
import type { StatusResult } from '@/esi/cache';
import { getCorporationCustomsOffices, type CorporationCustomsOffice } from '@/esi/endpoints';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

const KEY = 'customsOffices';

/** Every customs office the corporation owns. ESI or cache. */
export function loadCorporationCustomsOffices(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationCustomsOffice[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationCustomsOffices(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, KEY, fetchLive, {
    conditional,
  });
}
