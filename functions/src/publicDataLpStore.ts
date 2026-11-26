import { setTimeout as sleep } from 'node:timers/promises';
import { LP_CORP_STATION_SYSTEMS } from './data/lpCorpStationSystems.js';
import {
  INDUSTRY_SYSTEMS_URL,
  parseCostIndices,
  writeCostIndicesToR2,
} from './costIndicesSnapshot.js';
import { ESI_USER_AGENT, esiHeaders } from './esiClient.js';
import { LP_STORE_REQUEST_GAP_MS, fetchLpStoreRows } from './lpOffersSnapshot.js';
import { r2ConfigFromEnv } from './publicDataActiveWars.js';
import {
  LP_VOLUME_WINDOW_DAYS,
  VolumeFold,
  foldHistoryDayUrl,
  historyWindow,
  type FoldHistoryDay,
} from './marketHistoryVolume.js';
import {
  publishHaulingDemandToR2,
  publishLpStoreOffersToR2,
  publishLpStoreVolumeToR2,
} from './r2DailySnapshots.js';
import { createR2Get, createR2Put, type R2Get, type R2Put } from './r2Client.js';

const ESI_PUBLIC_HEADERS = esiHeaders();

const LP_STORE_MAX_FAILED_SHARE = 0.1;

export interface PublicLpStoreDeps {
  get: R2Get;
  put: R2Put;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleepImpl?: (ms: number) => Promise<unknown>;
  corporations?: Readonly<Record<number, readonly number[]>>;
  requestGapMs?: number;
  foldDayImpl?: FoldHistoryDay;
}

const LP_VOLUME_MIN_DAYS = 20;
const LP_VOLUME_FETCH_ATTEMPTS = 3;

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
  if (rows.length === 0 || failed.length > Math.max(1, rows.length * LP_STORE_MAX_FAILED_SHARE)) {
    throw new Error(
      `LP store offers: ${failed.length} corporations failed (${failed.join(', ')}); nothing published`
    );
  }
  await publishLpStoreOffersToR2(rows, (deps.now ?? Date.now)(), deps.put);
}

export async function publishLpStoreVolume(deps: PublicLpStoreDeps): Promise<void> {
  const foldDay = deps.foldDayImpl ?? foldHistoryDayUrl(ESI_USER_AGENT);
  const fold = new VolumeFold();
  let folded = 0;
  const failed: string[] = [];
  const missing: string[] = [];
  const window = historyWindow(new Date((deps.now ?? Date.now)()), LP_VOLUME_WINDOW_DAYS);
  for (const date of window) {
    for (let attempt = 1; attempt <= LP_VOLUME_FETCH_ATTEMPTS; attempt += 1) {
      try {
        if ((await foldDay(date, fold)) === 'folded') folded += 1;
        else missing.push(date);
        break;
      } catch (err) {
        if (attempt === LP_VOLUME_FETCH_ATTEMPTS) failed.push(`${date}: ${String(err)}`);
        else await (deps.sleepImpl ?? sleep)(2_000 * attempt);
      }
    }
  }
  console.info('LP store volume', { days: folded, missing, failed: failed.length });
  if (failed.length > 0 || folded < LP_VOLUME_MIN_DAYS) {
    throw new Error(
      `LP store volume: ${folded} days read, ${failed.length} failed (${failed[0] ?? 'none'}); nothing published`
    );
  }
  const lastSyncedAt = (deps.now ?? Date.now)();
  for (const regionId of fold.regionIds()) {
    await publishLpStoreVolumeToR2(
      regionId,
      { lastSyncedAt, days: folded, perDay: fold.perDay(regionId, folded) },
      deps.put
    );
    await publishHaulingDemandToR2(
      regionId,
      {
        lastSyncedAt,
        asOf: window[0]!,
        days: folded,
        types: fold.demandFor(regionId, window[0]!, LP_VOLUME_WINDOW_DAYS),
      },
      deps.put
    );
  }
}

export async function publishCostIndices(deps: PublicLpStoreDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const response = await (deps.fetchImpl ?? fetch)(INDUSTRY_SYSTEMS_URL, {
    headers: ESI_PUBLIC_HEADERS,
  });
  if (!response.ok) throw new Error(`industry systems: HTTP ${response.status}`);
  const indices = parseCostIndices(await response.json());
  const systems = Object.keys(indices).length;
  if (systems === 0) throw new Error('industry systems: no systems parsed');
  const date = new Date(now()).toISOString().slice(0, 10);
  const result = await writeCostIndicesToR2(
    [{ date, indices }],
    { get: deps.get, put: deps.put },
    now()
  );
  console.info('cost indices', { systems, ...result });
  if (result.failed > 0)
    throw new Error(`cost indices: ${result.failed} failed: ${result.firstError}`);
}

export async function publishLpStoreAndCostIndices(deps: PublicLpStoreDeps): Promise<void> {
  const failed: string[] = [];
  for (const [name, run] of [
    ['LP store offers', publishLpStoreOffers],
    ['LP store volume', publishLpStoreVolume],
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
