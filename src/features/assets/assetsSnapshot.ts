import {
  loadCharacterAssets,
  loadOtherCharactersAssetsDetailed,
  type SkippedCharacterAssets,
  type OtherCharacterAssets,
} from '@/features/assets/assets';
import type { CachedResult } from '@/esi/cache';
import { loadStationName } from '@/features/character/stations';
import { loadStructureName } from '@/features/character/structures';
import { loadSystemName } from '@/features/character/systemSecurity';
import { loadTypeNames } from '@/features/character/typeNames';
import { type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type { CharacterAsset } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { NO_ASSET_NAMES, type AssetNameMap } from '@/engine/assetNames';
import { loadCharacterAssetNames } from '@/features/assets/assetNames';
import { loadAssetCopyValues, type LoadBlueprints } from '@/features/assets/assetCopyValues';
import { startAssetReads } from '@/features/assets/assetReads';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { getAveragePriceByType } from '@/market/prices';

export interface Snapshot {
  assetsResult: CachedResult<CharacterAsset[]> | null;
  assetsTruncated: boolean;
  assetsNeedsReauth: boolean;
  typeNames: Map<number, string>;
  locationNames: Map<number, string>;
  priceByTypeId: Map<number, number>;
  copyValueByItemId: Map<number, number>;
  pricesReady: boolean;
  volumeByTypeId: Map<number, number>;
  assetNames: AssetNameMap;
}

function loadOwnBlueprints(characterId: number): LoadBlueprints {
  return async () => (await loadCharacterBlueprints(characterId)).cached?.data ?? null;
}

function loadOwnCopyValues(
  characterId: number,
  assets: readonly CharacterAsset[]
): Promise<Map<number, number>> {
  return loadAssetCopyValues(characterId, assets, loadOwnBlueprints(characterId));
}

export async function loadAssetsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal<Snapshot>
): Promise<Snapshot> {
  const pricesPromise = getAveragePriceByType();
  const { cached: assetsResult, needsReauth: assetsNeedsReauth } =
    await loadCharacterAssets(characterId);
  const assetsTruncated = assetsResult?.truncated ?? false;
  const assets = assetsResult?.data ?? [];

  let shown: Snapshot = {
    assetsResult,
    assetsTruncated,
    assetsNeedsReauth,
    typeNames: new Map(),
    locationNames: new Map(),
    priceByTypeId: new Map(),
    pricesReady: false,
    copyValueByItemId: new Map(),
    volumeByTypeId: new Map(),
    assetNames: NO_ASSET_NAMES,
  };
  const show = (patch: Partial<Snapshot>) => {
    shown = { ...shown, ...patch };
    signal.publish?.(shown);
  };
  show({});
  void pricesPromise.then((priceByTypeId) => show({ priceByTypeId, pricesReady: true }));

  const typeIds = signal.cancelled ? [] : [...new Set(assets.map((a) => a.type_id))];
  const reads = startAssetReads({
    characterId,
    assets,
    typeIds,
    loadBlueprints: loadOwnBlueprints(characterId),
    loadAssetNames: () => loadCharacterAssetNames(characterId, assets),
    cancelled: signal.cancelled,
  });
  void reads.copyValueByItemId.then(
    (copyValueByItemId) => show({ copyValueByItemId }),
    () => {}
  );
  void reads.assetNames.then((assetNames) => show({ assetNames }));
  const [typeNames, volumeByTypeId] = await Promise.all([
    loadTypeNames(typeIds),
    reads.volumeByTypeId,
  ]);
  show({ typeNames, volumeByTypeId });

  const stationIds = signal.cancelled
    ? []
    : [...new Set(assets.filter((a) => a.location_type === 'station').map((a) => a.location_id))];
  const structureIds = signal.cancelled
    ? []
    : [...new Set(assets.filter((a) => a.location_type === 'other').map((a) => a.location_id))];
  const systemIds = signal.cancelled
    ? []
    : [
        ...new Set(
          assets.filter((a) => a.location_type === 'solar_system').map((a) => a.location_id)
        ),
      ];
  const itemIds = signal.cancelled ? new Set<number>() : new Set(assets.map((a) => a.item_id));
  const orphanParentIds = signal.cancelled
    ? []
    : [
        ...new Set(
          assets
            .filter((a) => a.location_type === 'item' && !itemIds.has(a.location_id))
            .map((a) => a.location_id)
        ),
      ];
  const [resolvedStations, resolvedStructures, resolvedSystems, resolvedOrphanParents] =
    await Promise.all([
      Promise.all(stationIds.map((id) => loadStationName(id))),
      Promise.all(structureIds.map((id) => loadStructureName(characterId, id))),
      Promise.all(systemIds.map((id) => loadSystemName(id))),
      Promise.all(orphanParentIds.map((id) => loadStructureName(characterId, id))),
    ]);
  const locationNames = new Map<number, string>();
  stationIds.forEach((id, i) => {
    const name = resolvedStations[i];
    if (name) locationNames.set(id, name);
  });
  structureIds.forEach((id, i) => {
    const name = resolvedStructures[i];
    if (name) locationNames.set(id, name);
  });
  systemIds.forEach((id, i) => {
    const name = resolvedSystems[i];
    if (name) locationNames.set(id, name);
  });
  orphanParentIds.forEach((id, i) => {
    const name = resolvedOrphanParents[i];
    if (name) locationNames.set(id, name);
  });

  show({ locationNames });
  const [copyValueByItemId, priceByTypeId, assetNames] = await Promise.all([
    reads.copyValueByItemId,
    pricesPromise,
    reads.assetNames,
  ]);

  return {
    assetsResult,
    assetsTruncated,
    assetsNeedsReauth,
    typeNames,
    locationNames,
    priceByTypeId,
    pricesReady: true,
    copyValueByItemId,
    volumeByTypeId,
    assetNames,
  };
}

export interface CrossCharacterData {
  entries: OtherCharacterAssets[];
  typeNames: Map<number, string>;
  locationNames: Map<number, string>;
  characterIdByItemId: Map<number, number>;
  characterNameById: Map<number, string>;
  copyValueByItemId: Map<number, number>;
  skipped: SkippedCharacterAssets[];
}

async function loadCrossCharacterNames(
  entries: readonly OtherCharacterAssets[]
): Promise<{ typeNames: Map<number, string>; locationNames: Map<number, string> }> {
  const allAssets = entries.flatMap((entry) => entry.assets);
  const typeNames = await loadTypeNames(allAssets.map((a) => a.type_id));

  const locationNames = new Map<number, string>();
  const stationIds = [
    ...new Set(allAssets.filter((a) => a.location_type === 'station').map((a) => a.location_id)),
  ];
  const resolvedStations = await Promise.all(stationIds.map((id) => loadStationName(id)));
  stationIds.forEach((id, i) => {
    const name = resolvedStations[i];
    if (name) locationNames.set(id, name);
  });

  const systemIds = [
    ...new Set(
      allAssets.filter((a) => a.location_type === 'solar_system').map((a) => a.location_id)
    ),
  ];
  const resolvedSystems = await Promise.all(systemIds.map((id) => loadSystemName(id)));
  systemIds.forEach((id, i) => {
    const name = resolvedSystems[i];
    if (name) locationNames.set(id, name);
  });

  await mapWithConcurrencyLimit(entries, ESI_FANOUT_CONCURRENCY, async (entry) => {
    const structureIds = [
      ...new Set(entry.assets.filter((a) => a.location_type === 'other').map((a) => a.location_id)),
    ];
    await Promise.all(
      structureIds.map(async (id) => {
        const name = await loadStructureName(entry.characterId, id);
        if (name) locationNames.set(id, name);
      })
    );

    const itemIds = new Set(entry.assets.map((a) => a.item_id));
    const orphanParentIds = [
      ...new Set(
        entry.assets
          .filter((a) => a.location_type === 'item' && !itemIds.has(a.location_id))
          .map((a) => a.location_id)
      ),
    ];
    await Promise.all(
      orphanParentIds.map(async (id) => {
        const name = await loadStructureName(entry.characterId, id);
        if (name) locationNames.set(id, name);
      })
    );
  });

  return { typeNames, locationNames };
}

export async function loadCrossCharacterData(
  otherCharacterIds: readonly number[]
): Promise<CrossCharacterData> {
  const { entries, skipped } = await loadOtherCharactersAssetsDetailed(otherCharacterIds);
  const copyValueByItemId = new Map<number, number>();
  const [{ typeNames, locationNames }] = await Promise.all([
    loadCrossCharacterNames(entries),
    mapWithConcurrencyLimit(entries, ESI_FANOUT_CONCURRENCY, async (entry) => {
      for (const [itemId, value] of await loadOwnCopyValues(entry.characterId, entry.assets))
        copyValueByItemId.set(itemId, value);
    }),
  ]);

  const characterIdByItemId = new Map<number, number>();
  const characterNameById = new Map<number, string>();
  for (const entry of entries) {
    characterNameById.set(entry.characterId, entry.name);
    for (const asset of entry.assets) characterIdByItemId.set(asset.item_id, entry.characterId);
  }

  return {
    entries,
    typeNames,
    locationNames,
    characterIdByItemId,
    characterNameById,
    copyValueByItemId,
    skipped,
  };
}
