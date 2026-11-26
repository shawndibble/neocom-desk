import { loadCorporationId, loadCorporationStructures } from '@/features/corp/boardData';
import {
  EMPTY_CORP_ASSET_LABELS,
  assetPlaceIds,
  loadCorporationAssets,
  loadCorpAssetLabels,
  structureNameMap,
  toCorpAssetInputs,
  type CorpAssetLabels,
} from '@/features/corp/assets';
import { accountCorpReaders } from '@/features/corp/corpReadAccess';
import { loadCorporationDivisions } from '@/features/corp/wallet';
import { hangarDivisions } from '@/features/corp/divisions';
import { loadCorporationBlueprints } from '@/features/corp/blueprints';
import { loadTypeCategories, type AssetCategory } from '@/features/corp/assetCategories';
import type { CorpAssetInput } from '@/engine/corp/assetDivisions';
import { NO_ASSET_NAMES, type AssetNameMap } from '@/engine/assetNames';
import { loadCorporationAssetNames } from '@/features/assets/assetNames';
import { anyFromCache, oldestFetchedAt, startAssetReads } from '@/features/assets/assetReads';
import { getAveragePriceByType } from '@/market/prices';
import type { RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

export interface CorpAssetsSnapshot {
  corporationId: number | null;
  inputs: CorpAssetInput[] | null;
  divisionNames: ReadonlyMap<number, string | null>;
  labels: CorpAssetLabels;
  placeIds: readonly number[];
  assetNames: AssetNameMap;
  priceByTypeId: ReadonlyMap<number, number>;
  copyValueByItemId: ReadonlyMap<number, number>;
  volumeByTypeId: ReadonlyMap<number, number>;
  categoryByTypeId: ReadonlyMap<number, AssetCategory>;
  truncated: boolean;
  assetsShown: number;
  fetchedAt: Date | null;
  fromCache: boolean;
}

const EMPTY_SNAPSHOT: CorpAssetsSnapshot = {
  corporationId: null,
  inputs: null,
  divisionNames: new Map(),
  labels: EMPTY_CORP_ASSET_LABELS,
  placeIds: [],
  assetNames: NO_ASSET_NAMES,
  priceByTypeId: new Map(),
  copyValueByItemId: new Map(),
  volumeByTypeId: new Map(),
  categoryByTypeId: new Map(),
  truncated: false,
  assetsShown: 0,
  fetchedAt: null,
  fromCache: false,
};

export async function loadCorpAssetsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal,
  canReadBlueprints: boolean
): Promise<CorpAssetsSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null || signal.cancelled) return { ...EMPTY_SNAPSHOT, corporationId };

  const [assetsResult, divisionsResult, priceByTypeId] = await Promise.all([
    loadCorporationAssets(characterId, corporationId),
    loadCorporationDivisions(characterId, corporationId, true),
    getAveragePriceByType(),
  ]);

  if (signal.cancelled) return { ...EMPTY_SNAPSHOT, corporationId };

  const assets = assetsResult.cached?.data ?? null;
  const inputs = assets === null ? null : toCorpAssetInputs(assets);
  const typeIds = inputs === null ? [] : [...new Set(inputs.map((i) => i.typeId))];
  const placeIds = assets === null ? [] : assetPlaceIds(assets);
  const structureNames: Promise<Map<number, string>> = accountCorpReaders(
    'canReadStructures',
    characterId
  )
    .then((readers) => readers.get(corporationId))
    .then((reader) =>
      reader === undefined
        ? new Map<number, string>()
        : loadCorporationStructures(reader, corporationId).then((result) =>
            structureNameMap(result.cached?.data)
          )
    )
    .catch(() => new Map<number, string>());
  const reads = startAssetReads({
    characterId,
    assets: assets ?? [],
    typeIds,
    loadBlueprints: async () =>
      canReadBlueprints
        ? ((await loadCorporationBlueprints(characterId, corporationId)).cached?.data ?? null)
        : null,
    loadAssetNames: async () =>
      assets === null
        ? NO_ASSET_NAMES
        : loadCorporationAssetNames(characterId, corporationId, assets),
  });
  const [labels, volumeByTypeId, categoryByTypeId, copyValueByItemId, assetNames] =
    await Promise.all([
      assets === null
        ? EMPTY_CORP_ASSET_LABELS
        : loadCorpAssetLabels(assets, placeIds, structureNames),
      reads.volumeByTypeId,
      loadTypeCategories(typeIds),
      reads.copyValueByItemId,
      reads.assetNames,
    ]);
  const divisionNames = new Map(
    hangarDivisions(divisionsResult.cached?.data ?? null).map((d) => [d.division, d.name])
  );

  const results = [assetsResult, divisionsResult];
  return {
    corporationId,
    inputs,
    divisionNames,
    labels,
    placeIds,
    assetNames,
    priceByTypeId,
    copyValueByItemId,
    volumeByTypeId,
    categoryByTypeId,
    truncated: assetsResult.cached?.truncated ?? false,
    assetsShown: assets?.length ?? 0,
    fetchedAt: oldestFetchedAt(results),
    fromCache: anyFromCache(results),
  };
}
