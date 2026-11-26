import { ESI_USER_AGENT } from './esiClient.js';
import { isRecord } from './guards.js';
import { chunk } from './chunk.js';

const FUZZWORK_AGGREGATES = 'https://market.fuzzwork.co.uk/aggregates/';
const FUZZWORK_MAX_TYPES = 200;
const TIMEOUT_MS = 15_000;

const HEADERS = { 'User-Agent': ESI_USER_AGENT, Accept: 'application/json' };

function sellMin(raw: unknown): number | null {
  if (!isRecord(raw) || !isRecord(raw.sell)) return null;
  if (!(Number(raw.sell.orderCount) > 0)) return null;
  const price = Number(raw.sell.min);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export async function fetchFuzzworkPrices(
  stationId: number,
  typeIds: readonly number[],
  fetchImpl: typeof fetch = fetch
): Promise<Map<number, number | null> | null> {
  const prices = new Map<number, number | null>();
  try {
    for (const batch of chunk(typeIds, FUZZWORK_MAX_TYPES)) {
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
