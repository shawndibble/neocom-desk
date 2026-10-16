/**
 * Settings → Offline data: what is downloaded now (Cache Storage reads), the
 * storage estimate, and the forced download. The grouping is `offlinePacks.ts`.
 */
import { LAZY_SDE_FILES } from '@/sde/lazySdeFiles';
import { cachedLazySdeFiles, warmLazySde } from '@/sde/warmLazySde';
import { summarizePacks, type PackSummary } from './offlinePacks';

export interface OfflineStatus {
  packs: PackSummary[];
  /** The fitting engine's WASM and SDE snapshot are both stored. */
  engine: boolean;
  /** Everything downloadable: the lazy SDE files plus the engine (one item). */
  total: number;
  totalCached: number;
}

export async function readOfflineStatus(): Promise<OfflineStatus> {
  // Dynamic, like the warm: the engine module drags in the WASM glue.
  const [cachedFiles, engine] = await Promise.all([
    cachedLazySdeFiles(),
    import('@/features/fittings/dogmaFittingEngine').then(
      (module) => module.dogmaEngineAssetsCached(),
      () => false
    ),
  ]);
  return {
    packs: summarizePacks(LAZY_SDE_FILES, cachedFiles),
    engine,
    total: LAZY_SDE_FILES.length + 1,
    totalCached: cachedFiles.size + (engine ? 1 : 0),
  };
}

export interface StorageEstimate {
  usage: number;
  quota: number;
}

/** `navigator.storage.estimate()`, or `null` where it is missing or incomplete. */
export async function readStorageEstimate(): Promise<StorageEstimate | null> {
  try {
    const manager = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!manager || typeof manager.estimate !== 'function') return null;
    const { usage, quota } = await manager.estimate();
    return typeof usage === 'number' && typeof quota === 'number' && quota > 0
      ? { usage, quota }
      : null;
  } catch {
    return null;
  }
}

/**
 * Downloads every lazy SDE file and the engine, past the cellular / Save-Data
 * gate the background warm respects (the pilot asked). The same code as the
 * warm; what did not arrive is read back with `readOfflineStatus`.
 */
export async function downloadEverything(
  onProgress: (done: number, total: number) => void
): Promise<void> {
  await warmLazySde({ cancelled: false }, { force: true, onProgress });
}
