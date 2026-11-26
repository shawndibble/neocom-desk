import {
  CACHE_NAME,
  CACHE_PREFIX,
  ENGINE_ASSET_URLS,
  cachedEngineAsset,
  isEngineAsset,
} from './dogmaEngineAssets';
import { createIdleGuard, drainBodyWithGuard, readBodyWithGuard } from '@/lib/idleTimeout';

export async function deleteStaleAssetCaches(): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );
  } catch {}
}

export interface DogmaAssetProgress {
  loadedBytes: number;
  totalBytes: number | null;
}

export async function fetchWithProgress(
  url: string,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void
): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  const usable = cached && isEngineAsset(cached) ? cached : undefined;

  const guard = createIdleGuard();
  try {
    if (!usable) guard.arm();
    const response = usable ?? (await fetch(url, { signal: guard.signal }));
    if (!isEngineAsset(response)) {
      throw new Error(
        `${url}: not the engine asset (${response.status}, ${response.headers.get('content-type') ?? 'no type'})`
      );
    }
    const stored = usable ? undefined : cache.put(url, response.clone());
    stored?.catch(() => undefined);

    const totalHeader = response.headers.get('content-length');
    const totalBytes = totalHeader ? Number(totalHeader) : null;
    const bytes = await readBodyWithGuard(response, guard, (loaded) =>
      onProgress(loaded, totalBytes)
    );
    await stored;
    if (!response.body) onProgress(bytes.byteLength, totalBytes ?? bytes.byteLength);
    return bytes.buffer as ArrayBuffer;
  } finally {
    guard.clear();
  }
}

export function warmDogmaEngineAssets(): Promise<void> {
  warming ??= fillEngineAssetCache().finally(() => {
    warming = null;
  });
  return warming;
}

let warming: Promise<void> | null = null;

async function fillEngineAssetCache(): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const url of ENGINE_ASSET_URLS) {
      if (await cachedEngineAsset(cache, url)) continue;
      const guard = createIdleGuard();
      try {
        guard.arm();
        const response = await fetch(url, { signal: guard.signal });
        if (!isEngineAsset(response)) return;
        await Promise.all([cache.put(url, response.clone()), drainBodyWithGuard(response, guard)]);
      } finally {
        guard.clear();
      }
    }
  } catch {}
}
