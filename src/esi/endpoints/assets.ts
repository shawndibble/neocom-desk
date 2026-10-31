import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult } from '../paginated';
import type { EndpointOptions } from './options';
import { postChunked } from './postChunked';

// --- GET /characters/{character_id}/assets (esi-assets.read_assets.v1) ---

export interface CharacterAsset {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: 'station' | 'solar_system' | 'item' | 'other';
  location_flag: string;
  is_singleton: boolean;
  is_blueprint_copy?: boolean;
}

/**
 * A character's asset list can run into the tens of thousands of rows
 * (BPO libraries, PI, hangars scattered across many stations). Past this
 * many pages, further fetching costs more in ESI round trips than the view
 * can usefully render — stop and report the cut rather than fetch forever.
 */
const MAX_ASSET_PAGES = 25;

/**
 * Paginated (X-Pages), capped at MAX_ASSET_PAGES; see fetchAllPagesStatus.
 * `truncated` covers both the cap and a short read, so a partial list never
 * reaches the view looking whole.
 */
export function getCharacterAssets(
  characterId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CharacterAsset>> {
  return fetchAllPagesStatus<CharacterAsset>(`/characters/${characterId}/assets`, {
    ...options,
    characterId,
    endpointId: 'getCharacterAssets',
    maxPages: MAX_ASSET_PAGES,
  });
}

// --- GET /corporations/{corporation_id}/assets (esi-assets.read_corporation_assets.v1) ---

/**
 * Structurally identical to `CharacterAsset` in the live schema, down to the
 * optional `is_blueprint_copy` — the difference is entirely in the values.
 * `location_flag` carries `CorpSAG1`..`CorpSAG7` (the seven hangar divisions),
 * `OfficeFolder`, `CorpDeliveries` and `Impounded`, none of which ever appear
 * on a Character's own assets.
 *
 * Kept as its own interface rather than aliased to `CharacterAsset`: they are
 * two endpoints behind two scopes and two gates, and the corp one is the shape
 * a corp-assets surface will read.
 */
export interface CorporationAsset {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: 'station' | 'solar_system' | 'item' | 'other';
  location_flag: string;
  is_singleton: boolean;
  is_blueprint_copy?: boolean;
}

/**
 * Paginated (X-Pages) and capped at the same `MAX_ASSET_PAGES` as the character
 * list — a corporation's holdings are the larger of the two, so the cap matters
 * more here, and `truncated` reports it exactly as it does there.
 */
export function getCorporationAssets(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CorporationAsset>> {
  return fetchAllPagesStatus<CorporationAsset>(`/corporations/${corporationId}/assets`, {
    ...options,
    characterId,
    endpointId: 'getCorporationAssets',
    maxPages: MAX_ASSET_PAGES,
  });
}

// --- POST /characters/{character_id}/assets/names (esi-assets.read_assets.v1) ---

/** One in-game item name. ESI echoes the type name or `None` for an item the player never named. */
export interface AssetName {
  item_id: number;
  name: string;
}

/**
 * The names players gave their assembled ships and containers. Up to 1000 ids
 * per request (more are batched); ESI fails a whole batch on one id it cannot
 * name, so callers send singleton, nameable items only.
 */
export function postCharacterAssetNames(
  characterId: number,
  itemIds: number[],
  options: { signal?: AbortSignal } = {}
): Promise<AssetName[]> {
  return postChunked<number, AssetName>(
    `/characters/${characterId}/assets/names`,
    'postCharacterAssetNames',
    itemIds,
    options.signal,
    characterId
  );
}

// --- POST /corporations/{corporation_id}/assets/names (esi-assets.read_corporation_assets.v1) ---

/** The corp twin of `postCharacterAssetNames`; Director-only like the corp assets read. */
export function postCorporationAssetNames(
  characterId: number,
  corporationId: number,
  itemIds: number[],
  options: { signal?: AbortSignal } = {}
): Promise<AssetName[]> {
  return postChunked<number, AssetName>(
    `/corporations/${corporationId}/assets/names`,
    'postCorporationAssetNames',
    itemIds,
    options.signal,
    characterId
  );
}
