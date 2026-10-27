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
import { loadTypeNames, loadTypeVolumes } from '@/features/character/typeNames';
import { type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type { CharacterAsset } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadAssetCopyValues } from '@/features/assets/assetCopyValues';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { getAveragePriceByType } from '@/market/prices';

export interface Snapshot {
  assetsResult: CachedResult<CharacterAsset[]> | null;
  /** Pages were capped or missing — the list below is partial. */
  assetsTruncated: boolean;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  assetsNeedsReauth: boolean;
  typeNames: Map<number, string>;
  locationNames: Map<number, string>;
  /** Global average market price per type, used for the tree's estimated-value badges. */
  priceByTypeId: Map<number, number>;
  /** Each blueprint copy's own value by item id (`engine/blueprintCopyValue.ts`) — a copy never takes its type's average price. */
  copyValueByItemId: Map<number, number>;
  /** False in an early partial: values read 0 until prices land, so value filters must not apply. */
  pricesReady: boolean;
  /** m3 per unit, from the slim SDE snapshot only — best-effort, missing for market/asset-only types it doesn't cover. */
  volumeByTypeId: Map<number, number>;
}

/** A Character's own blueprint copies valued from contract listings, ME/TE/runs from its blueprints read when that scope is granted. */
function loadOwnCopyValues(
  characterId: number,
  assets: readonly CharacterAsset[]
): Promise<Map<number, number>> {
  return loadAssetCopyValues(
    characterId,
    assets,
    async () => (await loadCharacterBlueprints(characterId)).cached?.data ?? null
  );
}

export async function loadAssetsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal<Snapshot>
): Promise<Snapshot> {
  // Not awaited with the assets: a first-ever price read is the slowest call.
  const pricesPromise = getAveragePriceByType();
  const { cached: assetsResult, needsReauth: assetsNeedsReauth } =
    await loadCharacterAssets(characterId);
  const assetsTruncated = assetsResult?.truncated ?? false;
  const assets = assetsResult?.data ?? [];

  // Rows first, the slow reads (prices, Firestore copy values) fill in behind.
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
  };
  const show = (patch: Partial<Snapshot>) => {
    shown = { ...shown, ...patch };
    signal.publish?.(shown);
  };
  show({});
  void pricesPromise.then((priceByTypeId) => show({ priceByTypeId, pricesReady: true }));

  // Already superseded: skip the ESI name resolves, their results would be discarded.
  const typeIds = signal.cancelled ? [] : [...new Set(assets.map((a) => a.type_id))];
  const copyValuesPromise = signal.cancelled
    ? Promise.resolve(new Map<number, number>())
    : loadOwnCopyValues(characterId, assets);
  void copyValuesPromise.then(
    (copyValueByItemId) => show({ copyValueByItemId }),
    () => {}
  );
  const [typeNames, volumeByTypeId] = await Promise.all([
    loadTypeNames(typeIds),
    loadTypeVolumes(typeIds),
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
  // A `location_type: "item"` asset whose location_id matches no item_id in
  // this same fetch has a parent ESI never returned a row for — most often a
  // personal-hangar division inside a player-owned structure, which the
  // structures endpoint still resolves even though it never appears as its
  // own asset row. Cheap to try (only ever hit once per distinct missing
  // parent) and harmless to miss: an unresolvable id just 403/404s, same as
  // today's silent fallback.
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
      // Uncapped on purpose: `location_type: 'station'` means every one of
      // these is an NPC station, and those resolve out of the SDE snapshot
      // with no request at all (issue #655), so capping would slow a map
      // lookup down rather than spare ESI anything. It reverts to a request
      // per id only when the snapshot cannot be read — rare, and the fallback
      // is what keeps names working when the file cannot be fetched.
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
  const [copyValueByItemId, priceByTypeId] = await Promise.all([copyValuesPromise, pricesPromise]);

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
  };
}

/** Everything the cross-character Character filter (issue #746) merges into the active Character's own snapshot. */
export interface CrossCharacterData {
  entries: OtherCharacterAssets[];
  typeNames: Map<number, string>;
  locationNames: Map<number, string>;
  /** Owning Character per asset item_id — item ids are globally unique, so this is safe to merge flat across Characters. */
  characterIdByItemId: Map<number, number>;
  characterNameById: Map<number, string>;
  /** Every other Character's blueprint copies, valued the same way as the active one's. */
  copyValueByItemId: Map<number, number>;
  /** Chosen Characters whose assets could not be read: a search here cannot see their items. */
  skipped: SkippedCharacterAssets[];
}

/**
 * Type/location names for every other Character's assets, mirroring
 * `loadAssetsSnapshot`'s own resolution but per-Character for structures:
 * `loadStructureName` is ACL-checked and cached per Character (structures.ts),
 * so a structure must resolve under the Character whose asset actually sits
 * in it, not the active Character running the search.
 */
async function loadCrossCharacterNames(
  entries: readonly OtherCharacterAssets[]
): Promise<{ typeNames: Map<number, string>; locationNames: Map<number, string> }> {
  const allAssets = entries.flatMap((entry) => entry.assets);
  const typeNames = await loadTypeNames(allAssets.map((a) => a.type_id));

  const locationNames = new Map<number, string>();
  const stationIds = [
    ...new Set(allAssets.filter((a) => a.location_type === 'station').map((a) => a.location_id)),
  ];
  // A snapshot lookup per id, not a request per id — see `loadAssetsSnapshot`.
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

    // Same best-effort orphan-parent resolution as `loadAssetsSnapshot` — see
    // its comment. Scoped per-entry since a missing parent is ACL-checked
    // under the Character whose asset actually sits there.
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

/** Fetches + resolves everything the cross-character Character filter needs, once per resolved id set. */
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
