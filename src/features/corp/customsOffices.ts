import { conditionalPagedFetch } from '@/esi/cache';
import type { StatusResult } from '@/esi/cache';
import { getCorporationCustomsOffices, type CorporationCustomsOffice } from '@/esi/endpoints';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

const KEY = 'customsOffices';

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
