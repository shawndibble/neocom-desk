import type { CachedResult } from '@/esi/cache';
import { NO_ASSET_NAMES, type AssetNameMap } from '@/engine/assetNames';
import { loadTypeVolumes } from '@/features/character/typeNames';
import {
  loadAssetCopyValues,
  type CopyAssetRow,
  type LoadBlueprints,
} from '@/features/assets/assetCopyValues';

/** The slow reads every assets snapshot (personal, corp) fans out behind its rows. */
export interface AssetReads {
  volumeByTypeId: Promise<Map<number, number>>;
  copyValueByItemId: Promise<Map<number, number>>;
  assetNames: Promise<AssetNameMap>;
}

interface AssetReadsInput {
  characterId: number;
  assets: readonly CopyAssetRow[];
  typeIds: readonly number[];
  /** Each owner's own blueprint read, for a copy's ME/TE/runs. */
  loadBlueprints: LoadBlueprints;
  /** The owner's in-game ship/container names; must swallow its own failures. */
  loadAssetNames: () => Promise<AssetNameMap>;
  /** A superseded load: start nothing, resolve empty. */
  cancelled: boolean;
}

/**
 * Starts volumes, blueprint copy values and in-game names together and hands
 * back the promises, so a caller can publish each as it lands or await all.
 * Prices and type categories stay with the callers: personal starts prices
 * before its assets read, and only corp shows categories.
 */
export function startAssetReads({
  characterId,
  assets,
  typeIds,
  loadBlueprints,
  loadAssetNames,
  cancelled,
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

/** Oldest `fetchedAt` across the reads, so one badge speaks for the whole view; null when none carry one. */
export function oldestFetchedAt(
  results: readonly { cached?: Pick<CachedResult<unknown>, 'fetchedAt'> | null }[]
): Date | null {
  const dates = results
    .map((result) => result.cached?.fetchedAt)
    .filter((date): date is Date => date !== undefined);
  return dates.length === 0 ? null : dates.reduce((oldest, d) => (d < oldest ? d : oldest));
}

/** True when any read fell back to its saved copy. */
export function anyFromCache(
  results: readonly { cached?: Pick<CachedResult<unknown>, 'fromCache'> | null }[]
): boolean {
  return results.some((result) => result.cached?.fromCache);
}
