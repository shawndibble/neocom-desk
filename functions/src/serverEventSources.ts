// The public read behind the polled server-pushed events (issue #5121): a hub
// station's Fuzzwork aggregates, the same source the app reads
// (`src/market/fuzzwork.ts`). It needs no token and sends the app's descriptive
// User-Agent, which carries no email address.

import { ESI_USER_AGENT } from './esiClient.js';
import { isRecord } from './guards.js';

const FUZZWORK_AGGREGATES = 'https://market.fuzzwork.co.uk/aggregates/';
/** Fuzzwork batches poorly past this many types per request (the app's own cap). */
const FUZZWORK_MAX_TYPES = 200;
const TIMEOUT_MS = 15_000;

const HEADERS = { 'User-Agent': ESI_USER_AGENT, Accept: 'application/json' };

/** The lowest sell order at the station, or null: no orders on that side is no price, never 0. */
function sellMin(raw: unknown): number | null {
  if (!isRecord(raw) || !isRecord(raw.sell)) return null;
  if (!(Number(raw.sell.orderCount) > 0)) return null;
  const price = Number(raw.sell.min);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Lowest sell per type at one station, or null when any batch fails. */
export async function fetchFuzzworkPrices(
  stationId: number,
  typeIds: readonly number[],
  fetchImpl: typeof fetch = fetch
): Promise<Map<number, number | null> | null> {
  const prices = new Map<number, number | null>();
  try {
    for (let i = 0; i < typeIds.length; i += FUZZWORK_MAX_TYPES) {
      const batch = typeIds.slice(i, i + FUZZWORK_MAX_TYPES);
      const res = await fetchImpl(
        `${FUZZWORK_AGGREGATES}?station=${stationId}&types=${batch.join(',')}`,
        { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) }
      );
      if (!res.ok) return null;
      const body: unknown = await res.json();
      if (!isRecord(body)) return null;
      for (const typeId of batch) prices.set(typeId, sellMin(body[String(typeId)]));
    }
    return prices;
  } catch {
    return null;
  }
}
