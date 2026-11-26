import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult } from '../paginated';
import type { EndpointOptions } from './options';
import { postChunked } from './postChunked';

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

const MAX_ASSET_PAGES = 25;

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

export interface AssetName {
  item_id: number;
  name: string;
}

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
