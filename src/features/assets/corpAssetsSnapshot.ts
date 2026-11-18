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
  /**
   * `null` means the assets read itself did not come back — offline,
   * uncached, or a 403 the role gate swallowed — and is distinct from a
   * corporation that was read successfully and genuinely owns nothing.
   */
  inputs: CorpAssetInput[] | null;
  /** Division number -> the corp's own name for it, or null if unnamed/unresolved. */
  divisionNames: ReadonlyMap<number, string | null>;
  /** Type names, and the location names already on the device. The rest arrive after first paint (`resolveMissingLocationNames`). */
  labels: CorpAssetLabels;
  /** Every station/structure the assets sit in, named or not. */
  placeIds: readonly number[];
  /** In-game names of the corporation's ships and containers by item id (issue #5652); empty when none can be read. */
  assetNames: AssetNameMap;
  /** Global average market price per type, best-effort — an outage degrades ISK figures to 0 rather than the whole page. */
  priceByTypeId: ReadonlyMap<number, number>;
  /** Each blueprint copy's own value by item id (`engine/blueprintCopyValue.ts`) — a copy never takes its type's average price. */
  copyValueByItemId: ReadonlyMap<number, number>;
  /** Physical volume (m3, unpackaged) per type, best-effort from the slim SDE snapshot. */
  volumeByTypeId: ReadonlyMap<number, number>;
  /** Top-level market group per type, best-effort from the market catalogue. */
  categoryByTypeId: ReadonlyMap<number, AssetCategory>;
  /** The page cap was hit or a page was missing — corp holdings are the likelier of the two lists to hit it. */
  truncated: boolean;
  assetsShown: number;
  /** Oldest `fetchedAt` across the reads — the badge speaks for the whole view. */
  fetchedAt: Date | null;
  /** Either read fell back to its saved copy. */
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
  canReadBlueprints: boolean,
  canReadStructures: boolean
): Promise<CorpAssetsSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null || signal.cancelled) return { ...EMPTY_SNAPSHOT, corporationId };

  const [assetsResult, divisionsResult, priceByTypeId] = await Promise.all([
    loadCorporationAssets(characterId, corporationId),
    // Assets are Director-only, so this read is always open here.
    loadCorporationDivisions(characterId, corporationId, true),
    getAveragePriceByType(),
  ]);

  // A character switch mid-load: skip the label fan-out for a snapshot about
  // to be discarded rather than spending it on nothing.
  if (signal.cancelled) return { ...EMPTY_SNAPSHOT, corporationId };

  const assets = assetsResult.cached?.data ?? null;
  const inputs = assets === null ? null : toCorpAssetInputs(assets);
  const typeIds = inputs === null ? [] : [...new Set(inputs.map((i) => i.typeId))];
  const placeIds = assets === null ? [] : assetPlaceIds(assets);
  // The corporation's own structures list names every hangar's structure with
  // no per-id lookup; a role gap or failed read falls back to
  // `/universe/structures/{id}` after first paint.
  const structureNames: Promise<Map<number, string>> = canReadStructures
    ? loadCorporationStructures(characterId, corporationId)
        .then((result) => structureNameMap(result.cached?.data))
        .catch(() => new Map<number, string>())
    : Promise.resolve(new Map<number, string>());
  const reads = startAssetReads({
    characterId,
    assets: assets ?? [],
    typeIds,
    // Director-only endpoint: without the role a copy still prices, at ME0/TE0.
    loadBlueprints: async () =>
      canReadBlueprints
        ? ((await loadCorporationBlueprints(characterId, corporationId)).cached?.data ?? null)
        : null,
    // Only past the Director-gated assets read above; swallows its own failures.
    loadAssetNames: async () =>
      assets === null
        ? NO_ASSET_NAMES
        : loadCorporationAssetNames(characterId, corporationId, assets),
    cancelled: false,
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
