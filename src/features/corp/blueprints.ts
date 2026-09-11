/**
 * Fetch + cache layer for the corporation's blueprints (issue #839).
 *
 * The corp twin of `features/industry/data.ts`'s `loadCharacterBlueprints`,
 * with the same two disciplines every corp-owned ESI read applies via
 * `corpRead.ts`: a corp-scoped cache key so a corporation change misses
 * rather than serving the previous corporation's blueprints, and
 * `detectCorpAuthFailure` so a 403 reads as the in-game role gate
 * (`engine/corpRoles.ts`'s `canReadBlueprints` — Director-only) rather than
 * an expired session.
 */
import { getCorporationBlueprints, type CorporationBlueprint } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

/** Exported so a test can assert the row it lands in. */
export const CORP_BLUEPRINTS_KEY = 'blueprints:corporation';

export type CorpBlueprintsLoadResult = StatusResult<CorporationBlueprint[]>;

/** Every blueprint the corporation owns. ESI or cache. */
export function loadCorporationBlueprints(
  characterId: number,
  corporationId: number
): Promise<CorpBlueprintsLoadResult> {
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, CORP_BLUEPRINTS_KEY, () =>
    getCorporationBlueprints(characterId, corporationId)
  );
}
