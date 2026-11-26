import { ESI_USER_AGENT } from './esiClient.js';
import {
  OpenPriceFold,
  SNAPSHOT_HUBS,
  StationPriceFold,
  findFinalSnapshot,
  groupByDocument,
  implausibleReason,
  mergeDays,
  previousUtcDate,
  regionCounts,
  shrunkRegion,
} from './marketOpenPrices.js';
import { fetchJson, foldSnapshotUrl } from './marketOrdersArchive.js';
import { r2ConfigFromEnv } from './publicDataActiveWars.js';
import { writeOpenPricesToR2 } from './r2DailySnapshots.js';
import { createR2Get, createR2Put, type R2Get, type R2Put } from './r2Client.js';

export const MARKET_OPEN_PRICES_STATE_R2_KEY = 'open-prices-state/last-run.json';
const STATE_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

interface OpenPricesState {
  date?: unknown;
  regions?: Record<string, unknown>;
}

export interface PublicMarketOpenPricesDeps {
  get: R2Get;
  put: R2Put;
  now?: () => number;
  findFinalImpl?: typeof findFinalSnapshot;
  foldUrlImpl?: typeof foldSnapshotUrl;
}

export async function publishMarketOpenPrices(deps: PublicMarketOpenPricesDeps): Promise<boolean> {
  const date = previousUtcDate(new Date((deps.now ?? Date.now)()));
  const state = (await deps.get(MARKET_OPEN_PRICES_STATE_R2_KEY)) as OpenPricesState | null;
  if (state?.date === date) {
    console.info('Market open prices already published', { date });
    return false;
  }
  const found = await (deps.findFinalImpl ?? findFinalSnapshot)(date, (url) =>
    fetchJson(url, ESI_USER_AGENT)
  );
  if (!found.final) {
    throw new Error(
      `Market open prices: no final snapshot listed for ${date} (last listed: ${found.snapshot?.fileTime ?? 'none'})`
    );
  }
  const { url: snapshotUrl, fileTime } = found.snapshot;
  const fold = new OpenPriceFold();
  const stations = new StationPriceFold(SNAPSHOT_HUBS);
  const rows = await (deps.foldUrlImpl ?? foldSnapshotUrl)(
    snapshotUrl,
    fold,
    ESI_USER_AGENT,
    stations
  );
  console.info('Market open prices fold', {
    date,
    fileTime,
    snapshotUrl,
    rows,
    pairs: fold.size,
    stationPairs: stations.size,
  });
  const reason = implausibleReason(fold);
  if (reason) throw new Error(`Market open prices: nothing published (${reason})`);
  const shrunk = shrunkRegion(fold, state?.regions);
  if (shrunk) {
    throw new Error(
      `Market open prices: nothing published, snapshot shrank (${shrunk}); if the drop is real, delete ${MARKET_OPEN_PRICES_STATE_R2_KEY}`
    );
  }
  const { written, skipped, failed, firstError } = await writeOpenPricesToR2(
    groupByDocument(new Map([[date, stations]])),
    mergeDays,
    { get: deps.get, put: deps.put }
  );
  if (failed > 0) {
    throw new Error(
      `Market open prices: ${failed} shards failed to write to R2 (${written} written, ${skipped} unchanged); first error: ${firstError}`
    );
  }
  await deps.put(
    MARKET_OPEN_PRICES_STATE_R2_KEY,
    JSON.stringify({ date, regions: regionCounts(fold) }),
    STATE_HEADERS
  );
  console.info('Market open prices published', { date, written, skipped });
  return true;
}

export async function runPublicMarketOpenPrices(
  env: Record<string, string | undefined>
): Promise<void> {
  const config = r2ConfigFromEnv(env);
  await publishMarketOpenPrices({ get: createR2Get(config), put: createR2Put(config) });
}
