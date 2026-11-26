import { conditionalPagedFetch } from '@/esi/cache';
import {
  getCorporationAssets,
  type CorporationAsset,
  type CorporationStructure,
} from '@/esi/endpoints';
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

export const CORP_ASSETS_KEY = 'assets:corporation';

export type CorpAssetsLoadResult = StatusResult<CorporationAsset[]>;

export function loadCorporationAssets(
  characterId: number,
  corporationId: number
): Promise<CorpAssetsLoadResult> {
  const { fetchLive, conditional, expiresCapture } = conditionalPagedFetch((options) =>
    getCorporationAssets(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, CORP_ASSETS_KEY, fetchLive, {
    conditional,
    expiresCapture,
  });
}

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

export function assetPlaceIds(assets: readonly CorporationAsset[]): number[] {
  const itemIds = new Set(assets.map((asset) => asset.item_id));
  const places = new Set<number>();
  for (const asset of assets) {
    if (itemIds.has(asset.location_id)) continue;
    places.add(asset.location_id);
  }
  return [...places];
}

function splitPlaceIds(ids: readonly number[]): { structureIds: number[]; bulkIds: number[] } {
  return {
    structureIds: ids.filter((id) => id >= UPWELL_STRUCTURE_ID_FLOOR),
    bulkIds: ids.filter((id) => id < UPWELL_STRUCTURE_ID_FLOOR),
  };
}

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

export function structureNameMap(
  structures: readonly CorporationStructure[] | null | undefined
): Map<number, string> {
  const names = new Map<number, string>();
  for (const structure of structures ?? []) {
    if (structure.name) names.set(structure.structure_id, structure.name);
  }
  return names;
}

export interface CorpAssetLabels {
  types: ReadonlyMap<number, string>;
  locations: ReadonlyMap<number, string>;
}

export const EMPTY_CORP_ASSET_LABELS: CorpAssetLabels = {
  types: new Map(),
  locations: new Map(),
};

export async function loadCorpAssetLabels(
  assets: readonly CorporationAsset[],
  placeIds: readonly number[] = assetPlaceIds(assets),
  structureNames: ReadonlyMap<number, string> | Promise<ReadonlyMap<number, string>> = new Map()
): Promise<CorpAssetLabels> {
  const [types, locations, structures] = await Promise.all([
    loadTypeNames(assets.map((asset) => asset.type_id)),
    cachedAssetLocationNames(placeIds),
    structureNames,
  ]);
  return { types, locations: new Map([...locations, ...structures]) };
}
