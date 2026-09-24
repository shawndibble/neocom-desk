import wasmInit, { calculate, load_sde } from '@eveshipfit/dogma-engine';
import { fittingToDogmaFit } from '@/engine/fittings/fitMapper';
import { extractFittingStats } from '@/engine/fittings/stats';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';

/**
 * ADR 0016's "one seam module": the only place `@eveshipfit/dogma-engine` is
 * imported. Everything else (`src/engine/fittings/*`) works with plain
 * `Fitting`/`PilotProfile`/`FittingStats` shapes, so swapping the engine
 * later means rewriting this file, not its callers.
 */

const WASM_URL = '/vendor/dogma/esf_dogma_engine_bg.wasm';
const SDE_URL = '/vendor/dogma/sde.dat';

/**
 * Bump whenever `@eveshipfit/dogma-engine` or `@eveshipfit/sde` is bumped in
 * `package.json` (ADR 0016: the two are pinned and bumped together). The
 * fetch URLs above never change, so without this a browser that already
 * cached the old files under the old cache name would keep serving them
 * forever — this forces a fresh `caches.open` bucket, and hence a fresh
 * fetch, on the next bump.
 */
const CACHE_VERSION = 1;
const CACHE_NAME = `dogma-engine-assets-v${CACHE_VERSION}`;

export interface DogmaAssetProgress {
  loadedBytes: number;
  /** Null until both downloads' `Content-Length` are known. */
  totalBytes: number | null;
}

async function fetchWithProgress(
  url: string,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void
): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  const response = cached ?? (await fetch(url));
  if (!cached && response.ok) await cache.put(url, response.clone());

  const totalHeader = response.headers.get('content-length');
  const totalBytes = totalHeader ? Number(totalHeader) : null;
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    onProgress(buffer.byteLength, totalBytes ?? buffer.byteLength);
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress(loadedBytes, totalBytes);
  }
  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

let enginePromise: Promise<void> | null = null;

/**
 * Loads the WASM engine and its pinned SDE snapshot, lazily and once
 * (ADR 0016): fetched only the first time a caller asks, excluded from the
 * app-shell precache (`vite.config.ts`'s `globIgnores`), and cached here via
 * the Cache Storage API so a repeat visit — including offline — reuses them
 * instead of refetching. `onProgress` reports combined bytes across both
 * downloads as they stream in; a warm cache still reports 0 -> total almost
 * immediately, since a `cache.match` hit skips the network but not this
 * function's own byte counting.
 */
export function loadDogmaEngine(
  onProgress?: (progress: DogmaAssetProgress) => void
): Promise<void> {
  if (!enginePromise) {
    enginePromise = (async () => {
      let wasmLoaded = 0;
      let sdeLoaded = 0;
      let wasmTotal: number | null = null;
      let sdeTotal: number | null = null;
      const report = () => {
        const totalBytes = wasmTotal === null || sdeTotal === null ? null : wasmTotal + sdeTotal;
        onProgress?.({ loadedBytes: wasmLoaded + sdeLoaded, totalBytes });
      };

      const [wasmBytes, sdeBytes] = await Promise.all([
        fetchWithProgress(WASM_URL, (loaded, total) => {
          wasmLoaded = loaded;
          wasmTotal = total;
          report();
        }),
        fetchWithProgress(SDE_URL, (loaded, total) => {
          sdeLoaded = loaded;
          sdeTotal = total;
          report();
        }),
      ]);

      await wasmInit({ module_or_path: wasmBytes });
      load_sde(new Uint8Array(sdeBytes));
    })().catch((error: unknown) => {
      // A failed load (offline on first visit, a bad response, …) must not
      // wedge every later attempt behind the same rejected promise.
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

/**
 * Works out a Fitting's stats under a pilot's skills and implants. Loads the
 * engine first if this is the first call anywhere in the session.
 */
export async function computeFittingStats(
  fitting: Fitting,
  profile: PilotProfile,
  onProgress?: (progress: DogmaAssetProgress) => void
): Promise<FittingStats> {
  await loadDogmaEngine(onProgress);
  const dogmaFit = fittingToDogmaFit(fitting, profile);
  const calculation = calculate(dogmaFit);
  return extractFittingStats(
    dogmaFit.items.map((item) => item.type_id),
    calculation.ship.attributes,
    calculation.items
  );
}
