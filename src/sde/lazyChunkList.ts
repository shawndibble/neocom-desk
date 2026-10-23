/**
 * The build chunks the install does not precache (`lazy-chunks.json`, emitted
 * by vite.config.ts `lazyChunksPlugin`), so the idle warm can fetch them and the
 * Offline data panel can count them. Each is a path under the site base
 * (`assets/Market-AbC123.js`) that the service worker's cache-first route
 * stores when the page requests it (`sw.ts`).
 */

import { parseLazyChunksJson } from '@/app/lazyChunks';

/** The URL a chunk file is requested (and cached) under. */
export function lazyChunkUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

/**
 * The current build's lazy chunks, or `[]` when the list cannot be read
 * (offline, dev, a host without the file): callers then have nothing to warm.
 * `no-store`: the file is the build's own and must never come from a cache.
 */
export async function fetchLazyChunkList(): Promise<string[]> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}lazy-chunks.json`, {
      cache: 'no-store',
    });
    if (!response.ok) return [];
    return parseLazyChunksJson(await response.json());
  } catch {
    return [];
  }
}

/** Which of `files` are already in Cache Storage (by use or an earlier warm). Empty where it is unavailable. */
export async function cachedLazyChunks(files: readonly string[]): Promise<Set<string>> {
  const cached = new Set<string>();
  if (typeof caches === 'undefined') return cached;
  await Promise.all(
    files.map(async (file) => {
      try {
        if (await caches.match(lazyChunkUrl(file))) cached.add(file);
      } catch {
        // Treated as not cached.
      }
    })
  );
  return cached;
}
