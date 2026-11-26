import { conditionalPagedFetch } from '@/esi/cache';
import { getCorporationBlueprints, type CorporationBlueprint } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

export const CORP_BLUEPRINTS_KEY = 'blueprints:corporation';

export type CorpBlueprintsLoadResult = StatusResult<CorporationBlueprint[]>;

export function loadCorporationBlueprints(
  characterId: number,
  corporationId: number
): Promise<CorpBlueprintsLoadResult> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationBlueprints(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(
    characterId,
    corporationId,
    CORP_BLUEPRINTS_KEY,
    fetchLive,
    { conditional }
  );
}
