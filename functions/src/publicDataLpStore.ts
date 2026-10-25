/**
 * The LP store offers + industry cost indices job for the GitHub Actions runner
 * (`scripts/public-data/lp-store.mjs`, `.github/workflows/public-data-lp-store.yml`).
 * It replaces the `syncLpStoreOffers` Cloud Function with the same R2 keys and shapes
 * (`lp-store-offers/snapshot.json`, `cost-indices/<systemId>.json`). The job keeps no
 * state, so nothing moves to a state object. Touches no Firestore or Firebase app
 * (only `firebase-functions/logger`, via `r2ConfigFromEnv`'s module).
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { LP_CORP_STATION_SYSTEMS } from './data/lpCorpStationSystems.js';
import {
  INDUSTRY_SYSTEMS_URL,
  parseCostIndices,
  writeCostIndicesToR2,
} from './costIndicesSnapshot.js';
import { ESI_COMPATIBILITY_DATE, ESI_USER_AGENT } from './esiNotifications.js';
import { LP_STORE_REQUEST_GAP_MS, fetchLpStoreRows } from './lpOffersSnapshot.js';
import { r2ConfigFromEnv } from './publicDataActiveWars.js';
import { publishLpStoreOffersToR2 } from './r2DailySnapshots.js';
import { createR2Get, createR2Put, type R2Get, type R2Put } from './r2Client.js';

const ESI_PUBLIC_HEADERS = {
  'User-Agent': ESI_USER_AGENT,
  'X-User-Agent': ESI_USER_AGENT,
  'X-Compatibility-Date': ESI_COMPATIBILITY_DATE,
  Accept: 'application/json',
};

/** A run that lost more than this share of the corporations (ESI down) publishes nothing. */
const LP_STORE_MAX_FAILED_SHARE = 0.1;

export interface PublicLpStoreDeps {
  get: R2Get;
  put: R2Put;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleepImpl?: (ms: number) => Promise<unknown>;
  corporations?: Readonly<Record<number, readonly number[]>>;
  requestGapMs?: number;
}

/** Crawls every LP store and publishes the snapshot; throws when it published nothing. */
export async function publishLpStoreOffers(deps: PublicLpStoreDeps): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const { rows, failed } = await fetchLpStoreRows({
    corporations: deps.corporations ?? LP_CORP_STATION_SYSTEMS,
    fetchJson: async (url) => {
      const response = await fetchImpl(url, { headers: ESI_PUBLIC_HEADERS });
      const body: unknown = response.ok ? await response.json().catch(() => null) : null;
      return { status: response.status, retryAfter: response.headers.get('Retry-After'), body };
    },
    sleep: async (ms) => {
      await (deps.sleepImpl ?? sleep)(ms);
    },
    requestGapMs: deps.requestGapMs ?? LP_STORE_REQUEST_GAP_MS,
  });
  console.info('LP store offers', { corporations: rows.length, failed: failed.length });
  // The write replaces yesterday's snapshot wholesale, so a thin crawl leaves it standing.
  if (rows.length === 0 || failed.length > Math.max(1, rows.length * LP_STORE_MAX_FAILED_SHARE)) {
    throw new Error(
      `LP store offers: ${failed.length} corporations failed (${failed.join(', ')}); nothing published`
    );
  }
  await publishLpStoreOffersToR2(rows, (deps.now ?? Date.now)(), deps.put);
}

/** Merges today's industry cost indices into each system's R2 history object. */
export async function publishCostIndices(deps: PublicLpStoreDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const response = await (deps.fetchImpl ?? fetch)(INDUSTRY_SYSTEMS_URL, {
    headers: ESI_PUBLIC_HEADERS,
  });
  if (!response.ok) throw new Error(`industry systems: HTTP ${response.status}`);
  const indices = parseCostIndices(await response.json());
  const systems = Object.keys(indices).length;
  // Fail loud rather than store an empty day.
  if (systems === 0) throw new Error('industry systems: no systems parsed');
  const date = new Date(now()).toISOString().slice(0, 10);
  const result = await writeCostIndicesToR2(
    [{ date, indices }],
    { get: deps.get, put: deps.put },
    now()
  );
  console.info('cost indices', { systems, ...result });
  // The merge is idempotent, so a failed system is fixed by the next run; fail it so the run shows red.
  if (result.failed > 0)
    throw new Error(`cost indices: ${result.failed} failed: ${result.firstError}`);
}

/** Runs both halves; one failing still runs the other, then the run fails naming it. */
export async function publishLpStoreAndCostIndices(deps: PublicLpStoreDeps): Promise<void> {
  const failed: string[] = [];
  for (const [name, run] of [
    ['LP store offers', publishLpStoreOffers],
    ['cost indices', publishCostIndices],
  ] as const) {
    try {
      await run(deps);
    } catch (err) {
      failed.push(name);
      console.error(`${name} failed`, String(err));
    }
  }
  if (failed.length > 0) throw new Error(`Sync failed: ${failed.join(', ')}`);
}

export async function runPublicLpStore(env: Record<string, string | undefined>): Promise<void> {
  const config = r2ConfigFromEnv(env);
  await publishLpStoreAndCostIndices({ get: createR2Get(config), put: createR2Put(config) });
}
