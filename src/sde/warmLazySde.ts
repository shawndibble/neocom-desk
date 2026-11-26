import { sdeDataUrl } from './sdeDataUrl';
import { currentWarmLevel } from '@/lib/lazyAssetWarmGate';
import { fetchWithIdleTimeout } from '@/lib/idleTimeout';
import { LAZY_SDE_FILES, LAZY_SDE_PRIORITY_COUNT } from './lazySdeFiles';
import { runPool } from '@/lib/asyncPool';
import { fetchLazyChunkList, lazyChunkUrl } from './lazyChunkList';

export { LAZY_SDE_FILES };

export interface WarmSignal {
  cancelled: boolean;
}

function lazySdeFileUrl(file: string): string {
  return sdeDataUrl(import.meta.env.BASE_URL, file);
}

export async function cachedLazySdeFiles(): Promise<Set<string>> {
  const cached = new Set<string>();
  if (typeof caches === 'undefined') return cached;
  await Promise.all(
    LAZY_SDE_FILES.map(async (file) => {
      try {
        if (await caches.match(lazySdeFileUrl(file))) cached.add(file);
      } catch {}
    })
  );
  return cached;
}

export const ENGINE_ITEM = 'engine';

const CHUNK_WARM_CONCURRENCY = 6;

export const LAZY_ASSET_TOTAL = LAZY_SDE_FILES.length + 1;

const inFlight = new Map<string, Promise<boolean>>();

function warmFile(file: string): Promise<boolean> {
  const running = inFlight.get(file);
  if (running) return running;
  const started = (async () => {
    const url = lazySdeFileUrl(file);
    if (await caches.match(url)) return true;
    const { ok } = await fetchWithIdleTimeout(url, { drain: true });
    return ok;
  })().finally(() => inFlight.delete(file));
  inFlight.set(file, started);
  return started;
}

function warmChunk(file: string): Promise<boolean> {
  const key = `chunk:${file}`;
  const running = inFlight.get(key);
  if (running) return running;
  const started = (async () => {
    const url = lazyChunkUrl(file);
    if (await caches.match(url)) return true;
    const { ok } = await fetchWithIdleTimeout(url, { drain: true });
    return ok;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

async function warmEngine(): Promise<void> {
  const { warmDogmaEngineAssets } = await import('@/features/fittings/dogmaFittingEngine');
  await warmDogmaEngineAssets();
}

export async function warmFittingAssets(): Promise<void> {
  if (currentWarmLevel() !== 'all') return;
  try {
    await warmEngine();
  } catch {}
}

export interface WarmOptions {
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export function hasControllingServiceWorker(): boolean {
  return 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
}

export async function warmLazySde(
  signal: WarmSignal,
  { force = false, onProgress }: WarmOptions = {}
): Promise<string[]> {
  const failed: string[] = [];
  let done = 0;
  let total = LAZY_ASSET_TOTAL;
  const level = () => (force ? (navigator.onLine ? 'all' : 'none') : currentWarmLevel());
  try {
    const controlled = hasControllingServiceWorker();
    if (!controlled && !force) return failed;
    const chunks = controlled && level() === 'all' ? await fetchLazyChunkList() : [];
    total += chunks.length;
    const warmFiles = async (files: readonly string[]): Promise<boolean> => {
      for (const file of files) {
        if (signal.cancelled || level() === 'none') return false;
        try {
          if (!(await warmFile(file))) failed.push(file);
        } catch {
          failed.push(file);
        }
        onProgress?.(++done, total);
      }
      return true;
    };
    if (controlled && !(await warmFiles(LAZY_SDE_FILES.slice(0, LAZY_SDE_PRIORITY_COUNT)))) {
      return failed;
    }
    if (!signal.cancelled && level() === 'all') {
      try {
        await warmEngine();
      } catch {
        failed.push(ENGINE_ITEM);
      }
    }
    onProgress?.(controlled ? ++done : total, total);
    if (controlled && !(await warmFiles(LAZY_SDE_FILES.slice(LAZY_SDE_PRIORITY_COUNT)))) {
      return failed;
    }
    await runPool(
      chunks,
      CHUNK_WARM_CONCURRENCY,
      async (file) => {
        try {
          if (!(await warmChunk(file))) failed.push(file);
        } catch {
          failed.push(file);
        }
        onProgress?.(++done, total);
      },
      () => signal.cancelled || level() === 'none'
    );
  } catch {}
  return failed;
}
