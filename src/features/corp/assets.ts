/**
 * Fetch + cache layer for the corporation's assets (issue #327).
 *
 * The corp twin of `features/character/assets.ts`, and the same departures
 * every corp data module makes via `corpRead.ts`: a corp-scoped cache key
 * (issue #293) so a corporation change misses rather than serving the previous
 * corporation's hangars, and `detectCorpAuthFailure` so a 403 reads as the
 * in-game role gate rather than an expired session.
 *
 * The role gate is the whole story on this endpoint: `x-required-roles` is
 * `["Director"]` and nothing else, so a 403 is the ordinary answer for almost
 * everyone — see `engine/corpRoles.ts`'s `canReadAssets`.
 *
 * Registered and cached, with no surface reading it yet. `/assets` deliberately
 * does not offer a Personal / Corporation switch: seven hangar divisions across
 * many structures do not fit the station-and-container tree that page browses
 * (CONTEXT.md round 41). The corp assets surface is its own ticket, and this is
 * the read it will use.
 */
import { getCorporationAssets, type CorporationAsset } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { loadStructureName } from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import type { CorpAssetInput } from '@/engine/corp/assetDivisions';
import { loadCorpPaginatedWithCacheStatus } from './corpRead';

/**
 * Exported so a test can assert the row it lands in. Distinct from the
 * character list's `assets` key even before `corpCacheKey` wraps it: the two
 * lists share a Character's cache table and must never be mistaken for each
 * other.
 */
export const CORP_ASSETS_KEY = 'assets:corporation';

export type CorpAssetsLoadResult = StatusResult<CorporationAsset[]>;

/**
 * Everything the corporation owns. ESI or cache. `truncated` on the result
 * means the page cap was hit or a page was missing, so the list is short —
 * corp holdings are the larger of the two asset lists, so that is likelier here
 * than on a Character's own.
 */
export function loadCorporationAssets(
  characterId: number,
  corporationId: number
): Promise<CorpAssetsLoadResult> {
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, CORP_ASSETS_KEY, () =>
    getCorporationAssets(characterId, corporationId)
  );
}

/**
 * The boundary adaptation (ARCHITECTURE.md): ESI's snake_case
 * `CorporationAsset` becomes `engine/corp/assetDivisions.ts`'s
 * `CorpAssetInput`, the same split `members.ts`'s `toMemberActivity` makes
 * for `MemberActivity`. `location_type` and `is_singleton`/`is_blueprint_copy`
 * are dropped: the division grouping only ever reads `location_flag`.
 */
export function toCorpAssetInputs(assets: readonly CorporationAsset[]): CorpAssetInput[] {
  return assets.map((asset) => ({
    itemId: asset.item_id,
    typeId: asset.type_id,
    quantity: asset.quantity,
    locationId: asset.location_id,
    locationFlag: asset.location_flag,
  }));
}

/** The lowest id CCP issues to an Upwell structure — see the note below. */
const UPWELL_STRUCTURE_ID_FLOOR = 1_000_000_000_000;

/**
 * Location names for the distinct places this corporation's assets sit.
 *
 * Same split as `features/corp/members.ts`'s `resolveLocationNames`:
 * `/universe/names` 404s the *whole* batch if one id in it is unresolvable,
 * and an Upwell structure has no bulk name endpoint at all, so anything at or
 * above `UPWELL_STRUCTURE_ID_FLOOR` is resolved one at a time via
 * `loadStructureName` instead of being mixed into the batch. Unlike the
 * roster's version, there is no 1000-id chunking here: a corporation's
 * distinct asset locations are the offices and structures it holds, not one
 * per member, so a single `/universe/names` call is always enough.
 *
 * A structure the reading Character is not on the ACL for resolves to
 * nothing and the view falls back to the raw id, exactly as `members.ts` and
 * the personal Assets page both do.
 */
async function resolveAssetLocationNames(
  characterId: number,
  locationIds: readonly number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(locationIds)];
  const structureIds = unique.filter((id) => id >= UPWELL_STRUCTURE_ID_FLOOR);
  const bulkIds = unique.filter((id) => id < UPWELL_STRUCTURE_ID_FLOOR);

  const names = await resolveNames(bulkIds);
  const structureNames = await Promise.all(
    structureIds.map(async (id) => [id, await loadStructureName(characterId, id)] as const)
  );
  for (const [id, name] of structureNames) {
    if (name !== null) names.set(id, name);
  }
  return names;
}

/** Every label the corp assets view prints, resolved in as few calls as ESI allows. */
export interface CorpAssetLabels {
  types: ReadonlyMap<number, string>;
  locations: ReadonlyMap<number, string>;
}

export const EMPTY_CORP_ASSET_LABELS: CorpAssetLabels = {
  types: new Map(),
  locations: new Map(),
};

/**
 * Type and location names for a page of corp assets. Type names go through
 * `loadTypeNames` (SDE snapshot first, ESI only for what it misses) — the
 * same resolver the personal Assets page and the roster's ship column use —
 * never `resolveNames` directly, which knows nothing about the SDE.
 */
export async function loadCorpAssetLabels(
  characterId: number,
  assets: readonly CorporationAsset[]
): Promise<CorpAssetLabels> {
  const typeIds = assets.map((asset) => asset.type_id);
  const locationIds = assets.map((asset) => asset.location_id);
  const [types, locations] = await Promise.all([
    loadTypeNames(typeIds),
    resolveAssetLocationNames(characterId, locationIds),
  ]);
  return { types, locations };
}
