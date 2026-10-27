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
 * length (73).
 *
 * The same pass then warms the build's route chunks (`lazy-chunks.json`, see
 * `lazyChunkList.ts`): only the boot graph is precached, so a page the pilot
 * has not opened is not offline until this has run. They are many small
 * requests, so they go a few at a time (`CHUNK_WARM_CONCURRENCY`), last, and
 * only where the gate says `all` (or the pilot forced it); `sw.ts`'s
 * `lazy-chunks` route stores them.
 */
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

/** What the SW's `sde-data` cache stores a lazy file under: the loaders' own versioned URL. */
function lazySdeFileUrl(file: string): string {
  return sdeDataUrl(import.meta.env.BASE_URL, file);
}

/**
 * The lazy files already in Cache Storage (by use or an earlier warm), for the
 * Offline data panel. Same lookup `warmFile` makes; empty where Cache Storage
 * is unavailable.
 */
export async function cachedLazySdeFiles(): Promise<Set<string>> {
  const cached = new Set<string>();
  if (typeof caches === 'undefined') return cached;
  await Promise.all(
    LAZY_SDE_FILES.map(async (file) => {
      try {
        if (await caches.match(lazySdeFileUrl(file))) cached.add(file);
      } catch {
        // Treated as not cached.
      }
    })
  );
  return cached;
}

/** What `warmLazySde` reports in its failed list when the fitting engine could not be warmed (it is not a file). */
export const ENGINE_ITEM = 'engine';

/** Chunk fetches in flight at once: the site is HTTP/2, so a few at a time is quick without crowding the page's own requests. */
const CHUNK_WARM_CONCURRENCY = 6;

/** Every downloadable item but the build chunks: the lazy SDE files plus the fitting engine (one item). */
export const LAZY_ASSET_TOTAL = LAZY_SDE_FILES.length + 1;

/**
 * Files being fetched right now, by file. The background warm and a pilot's
 * "Download everything" can run at once (and in lockstep, both walking the
 * list from the top): a second asker joins the fetch under way instead of
 * starting its own.
 */
const inFlight = new Map<string, Promise<boolean>>();

/** Resolves `false` when the file could not be fetched (a non-2xx counts). */
function warmFile(file: string): Promise<boolean> {
  const running = inFlight.get(file);
  if (running) return running;
  const started = (async () => {
    const url = lazySdeFileUrl(file);
    // Already cached (by use or an earlier warm): nothing to fetch.
    if (await caches.match(url)) return true;
    // Read the body to the end so the SW finishes its cache write.
    const { ok } = await fetchWithIdleTimeout(url, { drain: true });
    return ok;
  })().finally(() => inFlight.delete(file));
  inFlight.set(file, started);
  return started;
}

/** A build chunk, through the same dedupe as `warmFile`; the service worker's chunk route stores it. */
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

/**
 * The Fittings page was opened: fetch the dogma engine now rather than wait
 * for the idle warm. Only where the gate says `all` (online, not Save-Data,
 * not cellular, not slow): on cellular the Fittings notice keeps its explicit
 * download button. Shares `warmDogmaEngineAssets`' in-flight fetch and skips a
 * cached engine, so a second visit or a running idle warm costs nothing.
 * (The catalogue files are precached, so only the engine is on demand.)
 */
export async function warmFittingAssets(): Promise<void> {
  if (currentWarmLevel() !== 'all') return;
  try {
    await warmEngine();
  } catch {
    // Reported through the engine status when the real load runs.
  }
}

export interface WarmOptions {
  /**
   * A pilot asked for everything ("Download everything for offline"): skip the
   * cellular / Save-Data / slow-network gate, and try the engine even without
   * a controlling service worker (it uses the Cache API, not the SW). Being
   * online is still required.
   */
  force?: boolean;
  /** Called after each file and after the engine: `done` of `total` (files + the engine). */
  onProgress?: (done: number, total: number) => void;
}

/** Whether a service worker controls this page, i.e. a fetch of an SDE file is cached by the `sde-data` route. */
export function hasControllingServiceWorker(): boolean {
  return 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
}

/**
 * Sequential, silent, single pass. The SDE files need a controlling service
 * worker (a fetch before it claims the page would not be cached); the
 * connection is re-checked before each file and before the engine. One file
 * failing (a dropped request, a 404) does not abandon the rest; resolves with
 * the items that failed (`ENGINE_ITEM` for the engine), so a caller or test can
 * see what the pass did not cache. A forced pass without a controlling worker skips the files (callers
 * check `hasControllingServiceWorker` to say so) but still fetches the engine.
 */
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
    // The build's route chunks are the bulk of the bytes: not on cellular or
    // Save-Data (`small`) unless the pilot forced it, and only where the worker's
    // chunk route can store them. Known up front so progress has its true total.
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
    // The engine sits after the priority files, ahead of the low-value rest.
    if (controlled && !(await warmFiles(LAZY_SDE_FILES.slice(0, LAZY_SDE_PRIORITY_COUNT)))) {
      return failed;
    }
    if (!signal.cancelled && level() === 'all') {
      try {
        await warmEngine();
      } catch {
        // A chunk that would not load (offline mid-deploy): the engine is reported, never retry-looped.
        failed.push(ENGINE_ITEM);
      }
    }
    onProgress?.(controlled ? ++done : total, total);
    if (controlled && !(await warmFiles(LAZY_SDE_FILES.slice(LAZY_SDE_PRIORITY_COUNT)))) {
      return failed;
    }
    // Last, and a few at a time: the SDE files above are what a page needs first.
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
  } catch {
    // The engine import or warm failed: lose it, never retry-loop.
  }
  return failed;
}
