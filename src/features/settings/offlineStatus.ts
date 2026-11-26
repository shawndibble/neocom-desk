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
  engine: boolean;
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

export type DownloadOutcome = 'done' | 'no-service-worker' | 'cancelled';

type ProgressListener = (done: number, total: number) => void;

interface ActiveDownload {
  promise: Promise<DownloadOutcome>;
  signal: WarmSignal;
  listeners: Set<ProgressListener>;
  last: [number, number] | null;
}

let active: ActiveDownload | null = null;

export function isDownloading(): boolean {
  return active !== null && !active.signal.cancelled;
}

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
    } catch {}
    if (signal.cancelled) return 'cancelled';
    return hasControllingServiceWorker() ? 'done' : 'no-service-worker';
  })().finally(() => {
    if (active === run) active = null;
  });
  return run;
}

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
