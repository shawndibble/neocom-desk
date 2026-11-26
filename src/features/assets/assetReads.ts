import type { CachedResult } from '@/esi/cache';
import { NO_ASSET_NAMES, type AssetNameMap } from '@/engine/assetNames';
import { loadTypeVolumes } from '@/features/character/typeNames';
import {
  loadAssetCopyValues,
  type CopyAssetRow,
  type LoadBlueprints,
} from '@/features/assets/assetCopyValues';

export interface AssetReads {
  volumeByTypeId: Promise<Map<number, number>>;
  copyValueByItemId: Promise<Map<number, number>>;
  assetNames: Promise<AssetNameMap>;
}

interface AssetReadsInput {
  characterId: number;
  assets: readonly CopyAssetRow[];
  typeIds: readonly number[];
  loadBlueprints: LoadBlueprints;
  loadAssetNames: () => Promise<AssetNameMap>;
  cancelled?: boolean;
}

export function startAssetReads({
  characterId,
  assets,
  typeIds,
  loadBlueprints,
  loadAssetNames,
  cancelled = false,
}: AssetReadsInput): AssetReads {
  if (cancelled) {
    return {
      volumeByTypeId: Promise.resolve(new Map()),
      copyValueByItemId: Promise.resolve(new Map()),
      assetNames: Promise.resolve(NO_ASSET_NAMES),
    };
  }
  return {
    volumeByTypeId: loadTypeVolumes(typeIds),
    copyValueByItemId: loadAssetCopyValues(characterId, assets, loadBlueprints),
    assetNames: loadAssetNames(),
  };
}

export function oldestFetchedAt(
  results: readonly { cached?: Pick<CachedResult<unknown>, 'fetchedAt'> | null }[]
): Date | null {
  const dates = results
    .map((result) => result.cached?.fetchedAt)
    .filter((date): date is Date => date !== undefined);
  return dates.length === 0 ? null : dates.reduce((oldest, d) => (d < oldest ? d : oldest));
}

export function anyFromCache(
  results: readonly { cached?: Pick<CachedResult<unknown>, 'fromCache'> | null }[]
): boolean {
  return results.some((result) => result.cached?.fromCache);
}
