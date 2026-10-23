/**
 * Fetch + cache layer for the corporation's assets (issue #327).
 *
 * The corp twin of `features/assets/assets.ts`, and the same departures
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
 * (GLOSSARY.md round 41). The corp assets surface is its own ticket, and this is
 * the read it will use.
 */
import { conditionalPagedFetch } from '@/esi/cache';
import { getCorporationAssets, type CorporationAsset } from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { readCachedNames, resolveNames } from '@/features/character/names';
import {
  loadStructureNameNoRoster,
  readCachedStructureNames,
} from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import type { CorpAssetInput } from '@/engine/corp/assetDivisions';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
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
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationAssets(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, CORP_ASSETS_KEY, fetchLive, {
    conditional,
  });
}

/**
 * The boundary adaptation (ARCHITECTURE.md): ESI's snake_case
 * `CorporationAsset` becomes `engine/corp/assetDivisions.ts`'s
 * `CorpAssetInput`, the same split `members.ts`'s `toMemberActivity` makes
 * for `MemberActivity`. `is_singleton`
 * carries through for the ledger (`assetLedger.ts`); the tree engine tells a
 * container from a leaf by whether anything else's `location_id` points at
 * it, not by this flag. `location_type` carries through too:
 * the ledger needs it to tell a division's own top-level roots from an asset nested
 * inside a container placed in one, and `is_blueprint_copy` does too, so a
 * copy is valued on its own rather than at its original's type price.
 */
export function toCorpAssetInputs(assets: readonly CorporationAsset[]): CorpAssetInput[] {
  return assets.map((asset) => ({
    itemId: asset.item_id,
    typeId: asset.type_id,
    quantity: asset.quantity,
    locationId: asset.location_id,
    locationType: asset.location_type,
    locationFlag: asset.location_flag,
    ...(asset.is_blueprint_copy ? { isBlueprintCopy: true } : {}),
    ...(typeof asset.is_singleton === 'boolean' ? { isSingleton: asset.is_singleton } : {}),
  }));
}

/**
 * The distinct places a corporation's assets sit: stations, Upwell structures
 * and solar systems. A `location_id` that is another asset's `item_id` is a
 * container or ship, not a place; item ids sit above `UPWELL_STRUCTURE_ID_FLOOR`
 * too, so looking them up as structures costs a refused request each.
 */
export function assetPlaceIds(assets: readonly CorporationAsset[]): number[] {
  const itemIds = new Set(assets.map((asset) => asset.item_id));
  const places = new Set<number>();
  for (const asset of assets) {
    if (asset.location_type === 'item' || itemIds.has(asset.location_id)) continue;
    places.add(asset.location_id);
  }
  return [...places];
}

/** Upwell structures have no bulk name endpoint; everything below the floor does. */
function splitPlaceIds(ids: readonly number[]): { structureIds: number[]; bulkIds: number[] } {
  return {
    structureIds: ids.filter((id) => id >= UPWELL_STRUCTURE_ID_FLOOR),
    bulkIds: ids.filter((id) => id < UPWELL_STRUCTURE_ID_FLOOR),
  };
}

/**
 * Names for `locationIds` that are already on this device — no request. This
 * is what lets the ledger render before any name lookup finishes.
 */
async function cachedAssetLocationNames(
  locationIds: readonly number[]
): Promise<Map<number, string>> {
  const { structureIds, bulkIds } = splitPlaceIds(locationIds);
  const [bulk, structures] = await Promise.all([
    readCachedNames(bulkIds),
    readCachedStructureNames(structureIds),
  ]);
  return new Map([...bulk, ...structures]);
}

/**
 * Looks up the places in `locationIds` the device does not already have a name
 * for, and returns only what it found.
 *
 * Same split as `features/corp/members.ts`'s `resolveLocationNames`:
 * `/universe/names` 404s the *whole* batch if one id in it is unresolvable, and
 * an Upwell structure has no bulk name endpoint at all, so anything at or
 * above `UPWELL_STRUCTURE_ID_FLOOR` is resolved one at a time instead of being
 * mixed into the batch. A structure the reading Character is not on the ACL
 * for stays unresolved and the view falls back to the raw id, exactly as
 * `members.ts` and the personal Assets page do; unlike them it does not ask the
 * rest of the roster (`loadStructureNameNoRoster`).
 *
 * The structure resolves are capped at `ESI_FANOUT_CONCURRENCY` (issue #420):
 * each is its own call against a rate-limited endpoint.
 */
export async function resolveMissingLocationNames(
  characterId: number,
  locationIds: readonly number[],
  known: ReadonlyMap<number, string> = new Map()
): Promise<Map<number, string>> {
  const missing = [...new Set(locationIds)].filter((id) => !known.has(id));
  const { structureIds, bulkIds } = splitPlaceIds(missing);

  const names = await resolveNames(bulkIds);
  await mapWithConcurrencyLimit(structureIds, ESI_FANOUT_CONCURRENCY, async (id) => {
    const name = await loadStructureNameNoRoster(characterId, id);
    if (name !== null) names.set(id, name);
  });
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
 * Type names, and the location names the device already has. Type names go
 * through `loadTypeNames` (SDE snapshot first, ESI only for what it misses) —
 * the same resolver the personal Assets page and the roster's ship column use —
 * never `resolveNames` directly, which knows nothing about the SDE.
 *
 * Location names that need a request are left to `resolveMissingLocationNames`,
 * which the view runs after the ledger is already on screen.
 */
export async function loadCorpAssetLabels(
  assets: readonly CorporationAsset[],
  placeIds: readonly number[] = assetPlaceIds(assets)
): Promise<CorpAssetLabels> {
  const [types, locations] = await Promise.all([
    loadTypeNames(assets.map((asset) => asset.type_id)),
    cachedAssetLocationNames(placeIds),
  ]);
  return { types, locations };
}
