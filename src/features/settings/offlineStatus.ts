/**
 * Settings → Offline data: what is downloaded now (Cache Storage reads), the
 * storage estimate, and the forced download. The grouping is `offlinePacks.ts`.
 */
import { LAZY_SDE_FILES } from '@/sde/lazySdeFiles';
import {
  LAZY_ASSET_TOTAL,
  cachedLazySdeFiles,
  hasControllingServiceWorker,
  warmLazySde,
  type WarmSignal,
} from '@/sde/warmLazySde';
import { cachedLazyChunks, fetchLazyChunkList } from '@/sde/lazyChunkList';
import { dogmaEngineAssetsCached } from '@/features/fittings/dogmaEngineAssets';
import { summarizePacks, type PackSummary } from './offlinePacks';

export interface OfflineStatus {
  packs: PackSummary[];
  /** The fitting engine's WASM and SDE snapshot are both stored. */
  engine: boolean;
  /** Everything downloadable: the lazy SDE files, the build's route chunks, and the engine (one item). */
  total: number;
  totalCached: number;
}

export async function readOfflineStatus(): Promise<OfflineStatus> {
  const [cachedFiles, engine, chunks] = await Promise.all([
    cachedLazySdeFiles(),
    dogmaEngineAssetsCached(),
    fetchLazyChunkList(),
  ]);
  const cachedChunks = await cachedLazyChunks(chunks);
  return {
    packs: summarizePacks(
      [...LAZY_SDE_FILES, ...chunks],
      new Set([...cachedFiles, ...cachedChunks])
    ),
    engine,
    total: LAZY_ASSET_TOTAL + chunks.length,
    totalCached: cachedFiles.size + cachedChunks.size + (engine ? 1 : 0),
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

export type DownloadOutcome =
  /** The pass ran to the end; what is still missing is read back with `readOfflineStatus`. */
  | 'done'
  /** No service worker controls the page yet, so the SDE files could not be cached (the engine was still tried). */
  | 'no-service-worker'
  | 'cancelled';

type ProgressListener = (done: number, total: number) => void;

interface ActiveDownload {
  promise: Promise<DownloadOutcome>;
  signal: WarmSignal;
  listeners: Set<ProgressListener>;
  last: [number, number] | null;
}

/** The one forced download under way, shared by every panel instance (a remount joins it). */
let active: ActiveDownload | null = null;

/** Whether a download the pilot started is running (a cancelled one still winding down is not). */
export function isDownloading(): boolean {
  return active !== null && !active.signal.cancelled;
}

/** Asks the running download to stop after the file in flight. */
export function cancelDownload(): void {
  if (active) active.signal.cancelled = true;
}

function startDownload(): ActiveDownload {
  const signal: WarmSignal = { cancelled: false };
  const listeners = new Set<ProgressListener>();
  const run: ActiveDownload = { signal, listeners, last: null, promise: undefined as never };
  run.promise = (async (): Promise<DownloadOutcome> => {
    try {
      await warmLazySde(signal, {
        force: true,
        onProgress: (done, total) => {
          run.last = [done, total];
          for (const listener of [...listeners]) listener(done, total);
        },
      });
    } catch {
      // Whatever did not arrive shows in the re-read status.
    }
    if (signal.cancelled) return 'cancelled';
    return hasControllingServiceWorker() ? 'done' : 'no-service-worker';
  })().finally(() => {
    if (active === run) active = null;
  });
  return run;
}

/**
 * Downloads every lazy SDE file and the engine, past the cellular / Save-Data
 * gate the background warm respects (the pilot asked). The same code as the
 * warm; what did not arrive is read back with `readOfflineStatus`. At most one
 * runs at a time: a call while one is under way joins it (and hears its
 * progress), so a remounted panel or a second tab-press never starts a second
 * pass. After `cancelDownload` the next call waits for the stopped pass, then
 * starts a fresh one.
 */
export async function downloadEverything(onProgress: ProgressListener): Promise<DownloadOutcome> {
  while (active?.signal.cancelled) await active.promise;
  active ??= startDownload();
  const run = active;
  run.listeners.add(onProgress);
  if (run.last) onProgress(...run.last);
  try {
    return await run.promise;
  } finally {
    run.listeners.delete(onProgress);
  }
}
