import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ESI_COMPATIBILITY_DATE, USER_AGENT as ESI_USER_AGENT } from './constants.mjs';
import { probeLpStores } from './lpCorporations.mjs';

const ESI_BASE = 'https://esi.evetech.net';
const PROBE_CACHE_NAME = 'market-regions-probe.json';
const LP_STORE_CACHE_NAME = 'lp-store-probe.json';

const PROBE_MAX_RETRY_WAIT_MS = 10_000;

export function probeRetryWaitMs(res) {
  const raw =
    res.status === 420
      ? res.headers.get('x-esi-error-limit-reset')
      : res.headers.get('retry-after');
  const seconds = raw === null ? NaN : Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : 1000;
  return Math.min(Math.max(ms, 0), PROBE_MAX_RETRY_WAIT_MS);
}

export async function fetchEsiProbe(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
          'X-User-Agent': ESI_USER_AGENT,
        },
      });
      if (res.status === 429 || res.status === 420) {
        if (attempt === 3) throw new Error(`HTTP ${res.status} for ${url} (rate limited)`);
        await new Promise((r) => setTimeout(r, probeRetryWaitMs(res)));
        continue;
      }
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status} for ${url}`);
      const errorsLeft = Number(res.headers.get('x-esi-error-limit-remain'));
      const tokensLeft = res.headers.has('x-ratelimit-remaining')
        ? Number(res.headers.get('x-ratelimit-remaining'))
        : NaN;
      if (
        (Number.isFinite(errorsLeft) && errorsLeft > 0 && errorsLeft < 20) ||
        (Number.isFinite(tokensLeft) && tokensLeft < 20)
      ) {
        await new Promise((r) => setTimeout(r, 1000));
      }
      return res;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

export async function fetchMarketTypesPage(regionId, page) {
  const res = await fetchEsiProbe(`${ESI_BASE}/markets/${regionId}/types/?page=${page}`);
  if (res.status === 404) return { typeIds: [], pages: 1 };
  const body = await res.json();
  const pages = Number(res.headers.get('x-pages')) || 1;
  return { typeIds: Array.isArray(body) ? body : [], pages };
}

export async function probeRegionHasMarket(regionId) {
  const { typeIds } = await fetchMarketTypesPage(regionId, 1);
  return typeIds.length > 0;
}

export async function fetchAllMarketTypeIds(regionId) {
  const first = await fetchMarketTypesPage(regionId, 1);
  const typeIds = [...first.typeIds];
  for (let page = 2; page <= first.pages; page++) {
    typeIds.push(...(await fetchMarketTypesPage(regionId, page)).typeIds);
  }
  return typeIds;
}

export async function probeMarketRegions(candidates, cacheDir) {
  let diskCache = {};
  try {
    diskCache = JSON.parse(await readFile(join(cacheDir, PROBE_CACHE_NAME), 'utf8'));
  } catch {}

  const result = [];
  const excluded = [];
  for (const region of candidates) {
    let hasMarket = diskCache[region.id];
    if (typeof hasMarket !== 'boolean') {
      hasMarket = await probeRegionHasMarket(region.id);
      diskCache[region.id] = hasMarket;
    }
    if (hasMarket) result.push(region);
    else excluded.push(region.name);
  }

  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(cacheDir, PROBE_CACHE_NAME), JSON.stringify(diskCache));

  console.log(`  market regions: ${result.length} carry orders, ${excluded.length} excluded`);
  console.log(`  excluded: ${excluded.join(', ')}`);
  return result;
}

export const LP_STORE_CONTROL_CORPORATIONS = [
  [1000120, 'Federation Navy'],
  [1000130, 'Sisters of EVE'],
  [1000128, "Mordu's Legion"],
  [1000125, 'CONCORD'],
  [1000127, 'Guristas'],
  [1000135, 'Serpentis Corporation'],
];

export async function fetchLpStoreHasOffers(corporationId) {
  const res = await fetchEsiProbe(`${ESI_BASE}/loyalty/stores/${corporationId}/offers/`);
  if (res.status === 404) return false;
  const body = await res.json();
  return Array.isArray(body) && body.length > 0;
}

export async function probeLpStoreCorporations(corps, cacheDir) {
  let diskCache = {};
  try {
    diskCache = JSON.parse(await readFile(join(cacheDir, LP_STORE_CACHE_NAME), 'utf8'));
  } catch {}
  const { lpCorporations, cache, probed, failed } = await probeLpStores(corps, {
    cache: diskCache,
    hasOffers: fetchLpStoreHasOffers,
  });
  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(cacheDir, LP_STORE_CACHE_NAME), JSON.stringify(cache));
  console.log(
    `  LP stores: ${lpCorporations.length} of ${corps.length} corps (${probed} probed, ${corps.length - probed - failed.length} cached${failed.length > 0 ? `, ${failed.length} failed` : ''})`
  );
  if (failed.length > 0) {
    console.error(
      `  FAIL: LP store probe failed for ${failed.length} corporation(s): ${failed.join(', ')}`
    );
    process.exitCode = 1;
  }
  return lpCorporations;
}
