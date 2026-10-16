/**
 * Background warm of the lazy SDE files (ADR: feature SDE files load on
 * demand) so Market/Industry/Ship Tree/PI/Fittings work offline on a device
 * that never opened them online. Fetch-only via `sdeDataUrl` (the exact URLs
 * the loaders use), so the service worker's CacheFirst `sde-data` route
 * stores them; the body is dropped rather than parsed and memoized, to keep
 * a ~28 MB parse and its heap off the main thread.
 *
 * The list is `lazySdeFiles.ts`, shared with `vite.config.ts`'s precache
 * ignores. Entry budget in `sde-data` (maxEntries 150 in `sw.ts`): ~2x its
 * length (73: 9 files + 64 `typeInfo/` shards), so a deploy's stale `?v=`
 * entries never evict a current one.
 */
import { sdeDataUrl } from './sdeDataUrl';
import { currentWarmLevel } from '@/lib/lazyAssetWarmGate';
import { fetchWithIdleTimeout } from '@/lib/idleTimeout';
import { LAZY_SDE_FILES } from './lazySdeFiles';

export { LAZY_SDE_FILES };

export interface WarmSignal {
  cancelled: boolean;
}

/** Resolves `false` when the file could not be fetched (a non-2xx counts). */
async function warmFile(file: string): Promise<boolean> {
  const url = sdeDataUrl(import.meta.env.BASE_URL, file);
  // Already cached (by use or an earlier warm): nothing to fetch.
  if (await caches.match(url)) return true;
  // Read the body to the end so the SW finishes its cache write.
  const { ok } = await fetchWithIdleTimeout(url, { drain: true });
  return ok;
}

/**
 * Sequential, silent, single pass. Needs a controlling service worker (a
 * fetch before it claims the page would not be cached) and re-checks the
 * connection before each file and before the engine. One file failing (a
 * dropped request, a 404) does not abandon the rest; resolves with the files
 * that failed, so a caller or test can see what the pass did not cache.
 */
export async function warmLazySde(signal: WarmSignal): Promise<string[]> {
  const failed: string[] = [];
  try {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return failed;
    for (const file of LAZY_SDE_FILES) {
      if (signal.cancelled || currentWarmLevel() === 'none') return failed;
      try {
        if (!(await warmFile(file))) failed.push(file);
      } catch {
        failed.push(file);
      }
    }
    if (signal.cancelled || currentWarmLevel() !== 'all') return failed;
    const { warmDogmaEngineAssets } = await import('@/features/fittings/dogmaFittingEngine');
    await warmDogmaEngineAssets();
  } catch {
    // The engine import or warm failed: lose it, never retry-loop.
  }
  return failed;
}
