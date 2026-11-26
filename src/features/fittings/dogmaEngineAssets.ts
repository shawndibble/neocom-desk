export const WASM_URL = '/vendor/dogma/esf_dogma_engine_bg.wasm';
export const SDE_URL = '/vendor/dogma/sde.dat';
export const ENGINE_ASSET_URLS: readonly string[] = [WASM_URL, SDE_URL];

export const CACHE_PREFIX = 'dogma-engine-assets-';
export const CACHE_NAME = `${CACHE_PREFIX}${__DOGMA_PINS__}`;

export function isEngineAsset(response: Response): boolean {
  return response.ok && !(response.headers.get('content-type') ?? '').includes('text/html');
}

export async function cachedEngineAsset(cache: Cache, url: string): Promise<Response | undefined> {
  const hit = await cache.match(url);
  return hit && isEngineAsset(hit) ? hit : undefined;
}

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
