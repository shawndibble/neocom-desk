import {
  CACHE_NAME,
  CACHE_PREFIX,
  ENGINE_ASSET_URLS,
  cachedEngineAsset,
  isEngineAsset,
} from './dogmaEngineAssets';
import { createIdleGuard, drainBodyWithGuard, readBodyWithGuard } from '@/lib/idleTimeout';

/**
 * Engine asset download + Cache Storage upkeep. Imports no engine code: the
 * ADR 0016 seam (`dogmaFittingEngine.ts`) stays the only importer of
 * `@eveshipfit/dogma-engine` and re-exports what callers need from here.
 */

/**
 * Deletes every earlier pin's bucket — each holds ~10 MB that nothing will
 * read again. Best-effort and off the load's critical path: a failure here
 * only leaves the old bucket behind until the next load tries again.
 */
export async function deleteStaleAssetCaches(): Promise<void> {
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );
  } catch {
    // Cache Storage unavailable or refused — see above.
  }
}

export interface DogmaAssetProgress {
  loadedBytes: number;
  /** Null until both downloads' `Content-Length` are known. */
  totalBytes: number | null;
}

export async function fetchWithProgress(
  url: string,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void
): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  // An HTML page cached by an earlier load is refetched, not served forever.
  const usable = cached && isEngineAsset(cached) ? cached : undefined;

  // Stall detection: a download that receives nothing for IDLE_TIMEOUT_MS is
  // aborted, so a hung connection rejects into the caller's failure path
  // instead of leaving "Downloading ship data…" up forever. An idle timer, not
  // a total one: a big file on a slow link keeps going while bytes arrive.
  const guard = createIdleGuard();
  try {
    if (!usable) guard.arm();
    const response = usable ?? (await fetch(url, { signal: guard.signal }));
    if (!isEngineAsset(response)) {
      throw new Error(
        `${url}: not the engine asset (${response.status}, ${response.headers.get('content-type') ?? 'no type'})`
      );
    }
    // Not awaited until the body has been read: the put settles only once its
    // copy of the body is consumed, which would starve the idle timer of chunks.
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

/**
 * Background warm: puts the WASM + SDE snapshot into this module's own Cache
 * Storage bucket without initialising the engine (no WASM compile, nothing
 * held in memory), so the first Fittings open offline finds them. Same
 * bucket and URLs `loadDogmaEngine` reads. Resolves quietly on any failure,
 * a stalled download included.
 */
export function warmDogmaEngineAssets(): Promise<void> {
  // One at a time: the background warm and a Settings "Download everything"
  // that overlap share this fetch instead of each pulling ~10 MB.
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
        // The put consumes the body but can't re-arm the guard; a clone read
        // alongside it can.
        await Promise.all([cache.put(url, response.clone()), drainBodyWithGuard(response, guard)]);
      } finally {
        guard.clear();
      }
    }
  } catch {
    // Offline, quota, Cache Storage unavailable — the real load retries on use.
  }
}
