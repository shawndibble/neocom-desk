/**
 * Where the dogma engine's two downloads live and how to tell they are stored.
 * A light module apart from `dogmaFittingEngine.ts` (which imports the WASM
 * glue): Settings → Offline data reads the cached state from here without
 * pulling that chunk in. The Cache API, not the service worker, holds them.
 */

export const WASM_URL = '/vendor/dogma/esf_dogma_engine_bg.wasm';
export const SDE_URL = '/vendor/dogma/sde.dat';
export const ENGINE_ASSET_URLS: readonly string[] = [WASM_URL, SDE_URL];

/**
 * Keyed on the pinned `@eveshipfit/dogma-engine` + `@eveshipfit/sde`
 * versions (`__DOGMA_PINS__`, from `package.json` via `vite.config.ts`;
 * ADR 0016: the two are pinned and bumped together). The fetch URLs above
 * never change, so without a per-pin name a browser that already cached the
 * old files would keep serving them forever — a bump is a fresh
 * `caches.open` bucket, and hence a fresh fetch, with nothing to remember
 * to hand-bump (it used to be a hand-maintained `-v1`).
 */
export const CACHE_PREFIX = 'dogma-engine-assets-';
export const CACHE_NAME = `${CACHE_PREFIX}${__DOGMA_PINS__}`;

/**
 * Whether a response is the binary asset rather than an error or the app's
 * own HTML page — which a host's SPA fallback (or a dev server that started
 * before the copy below it landed) answers a missing file with, as a 200.
 */
export function isEngineAsset(response: Response): boolean {
  return response.ok && !(response.headers.get('content-type') ?? '').includes('text/html');
}

/** The stored, usable response for `url` in `cache`, or `undefined` (a cached HTML page is not usable). */
export async function cachedEngineAsset(cache: Cache, url: string): Promise<Response | undefined> {
  const hit = await cache.match(url);
  return hit && isEngineAsset(hit) ? hit : undefined;
}

/**
 * Whether the WASM and the SDE snapshot are both in this pin's cache bucket,
 * i.e. the engine would start offline. Reads only; false where Cache Storage
 * is unavailable.
 */
export async function dogmaEngineAssetsCached(): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const url of ENGINE_ASSET_URLS) {
      if (!(await cachedEngineAsset(cache, url))) return false;
    }
    return true;
  } catch {
    return false;
  }
}
