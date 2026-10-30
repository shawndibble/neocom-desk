/**
 * In-game ship/container names for the Assets pages (issue #5652). Read after
 * the assets load, cached in `esiCache` beside them (so they paint offline and
 * are re-read on the same cadence), and never allowed to break a page: any
 * failure falls back to the last saved names, else none, and rows read as today.
 */
import { corpCacheKey, loadWithCacheStatus, readCached } from '@/esi/cache';
import {
  postCharacterAssetNames,
  postCorporationAssetNames,
  type AssetName,
} from '@/esi/endpoints';
import {
  isNameableGroup,
  nameableItemIds,
  NO_ASSET_NAMES,
  realAssetNames,
  type AssetNameMap,
} from '@/engine/assetNames';
import { loadCorpWithCacheStatus } from '@/features/corp/corpRead';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';

export const ASSET_NAMES_KEY = 'assets:names';

interface NameableAsset {
  item_id: number;
  type_id: number;
  is_singleton: boolean;
}

async function fetchRealNames(
  assets: readonly NameableAsset[],
  post: (ids: number[]) => Promise<AssetName[]>
): Promise<AssetNameMap> {
  const [types, groupCategories] = await Promise.all([
    loadTypes(),
    // Without it no type reads as nameable: no names beats a failed batch.
    loadGroupCategories().catch(() => ({}) as Record<string, number>),
  ]);
  const ids = nameableItemIds(assets, (typeId) => {
    const groupId = types[String(typeId)]?.groupID;
    return isNameableGroup(
      groupId,
      groupId === undefined ? undefined : groupCategories[String(groupId)]
    );
  });
  if (ids.length === 0) return NO_ASSET_NAMES;
  const raw = await post(ids);
  const typeIdByItemId = new Map(assets.map((a) => [a.item_id, a.type_id]));
  return realAssetNames(raw, typeIdByItemId, (typeId) => types[String(typeId)]?.name);
}

/** A Character's in-game asset names: fresh cache, else ESI, else the saved copy, else none. */
export async function loadCharacterAssetNames(
  characterId: number,
  assets: readonly NameableAsset[]
): Promise<AssetNameMap> {
  try {
    const result = await loadWithCacheStatus<AssetNameMap>(characterId, ASSET_NAMES_KEY, () =>
      fetchRealNames(assets, (ids) => postCharacterAssetNames(characterId, ids))
    );
    return result.cached?.data ?? NO_ASSET_NAMES;
  } catch {
    return (
      (await readCached<AssetNameMap>(characterId, ASSET_NAMES_KEY).catch(() => undefined)) ??
      NO_ASSET_NAMES
    );
  }
}

/** The corporation's in-game asset names, under the Director gate its assets read already passed. */
export async function loadCorporationAssetNames(
  characterId: number,
  corporationId: number,
  assets: readonly NameableAsset[]
): Promise<AssetNameMap> {
  try {
    const result = await loadCorpWithCacheStatus<AssetNameMap>(
      characterId,
      corporationId,
      ASSET_NAMES_KEY,
      () =>
        fetchRealNames(assets, (ids) => postCorporationAssetNames(characterId, corporationId, ids))
    );
    return result.cached?.data ?? NO_ASSET_NAMES;
  } catch {
    return (
      (await readCached<AssetNameMap>(
        characterId,
        corpCacheKey(corporationId, ASSET_NAMES_KEY)
      ).catch(() => undefined)) ?? NO_ASSET_NAMES
    );
  }
}
