/**
 * Background warm of the lazy SDE files (ADR: feature SDE files load on
 * demand) so Market/Industry/Ship Tree/PI/Fittings work offline on a device
 * that never opened them online. Fetch-only via `sdeDataUrl` (the exact URLs
 * the loaders use), so the service worker's CacheFirst `sde-data` route
 * stores them; the body is dropped rather than parsed and memoized, to keep
 * a ~16 MB parse and its heap off the main thread.
 *
 * Entry budget in `sde-data` (maxEntries 32 in `sw.ts`): LAZY_SDE_FILES.
 */
import { sdeDataUrl } from './sdeDataUrl';
import { currentWarmLevel } from '@/lib/lazyAssetWarmGate';

/** Everything `vite.config.ts` globIgnores under `data/` (the dogma engine is cached separately). */
export const LAZY_SDE_FILES = [
  'masteries.json',
  'blueprints.json',
  'reprocessing.json',
  'marketWideTrees.json',
  'pi-planet-radius.json',
  'pi-system-planets.json',
  'shipTree.json',
  'typeNames.json',
  'market/groups.json',
  'market/types.json',
  'market/systems.json',
  'market/stations.json',
  'market/jumps.json',
  'market/regions.json',
  'market/globalMarkets.json',
  'market/attributes.json',
  'market/variations.json',
  'market/lpCorporations.json',
] as const;

export interface WarmSignal {
  cancelled: boolean;
}

async function warmFile(file: string): Promise<void> {
  const url = sdeDataUrl(import.meta.env.BASE_URL, file);
  // Already cached (by use or an earlier warm): nothing to fetch.
  if (await caches.match(url)) return;
  const res = await fetch(url);
  if (res.ok) await res.arrayBuffer(); // drain so the SW finishes its cache write
}

/**
 * Sequential, silent, single pass. Needs a controlling service worker (a
 * fetch before it claims the page would not be cached) and re-checks the
 * connection before each file and before the engine.
 */
export async function warmLazySde(signal: WarmSignal): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    for (const file of LAZY_SDE_FILES) {
      if (signal.cancelled || currentWarmLevel() === 'none') return;
      await warmFile(file);
    }
    if (signal.cancelled || currentWarmLevel() !== 'all') return;
    const { warmDogmaEngineAssets } = await import('@/features/fittings/dogmaFittingEngine');
    await warmDogmaEngineAssets();
  } catch {
    // Offline or a failed fetch: lose the warm, never retry-loop.
  }
}
