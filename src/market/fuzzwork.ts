/**
 * Fuzzwork market aggregates client — primary price source (ADR 0002).
 * https://market.fuzzwork.co.uk/aggregates/?station={id}&types={csv}
 *
 * Response values arrive as JSON strings and must be parsed. A type with no
 * orders on a side still gets a key back, but with orderCount 0 — that side's
 * price is reported as null, never coerced to 0.
 */
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

export const FUZZWORK_AGGREGATES_URL = 'https://market.fuzzwork.co.uk/aggregates/';

/** Fuzzwork batches queries poorly past this many type IDs per request. */
const MAX_TYPES_PER_REQUEST = 200;
/**
 * Batches in flight at once. A batch takes about a second, so thousands of
 * types (Below market prices every listed item) took most of a minute one at a
 * time; a few at once stays polite to a community-run server.
 */
const BATCH_CONCURRENCY = 4;

export interface HubAggregate {
  /** Lowest sell order price, or null when the station has no sell orders. */
  sellMin: number | null;
  /** Highest buy order price, or null when the station has no buy orders. */
  buyMax: number | null;
  sellVolume: number;
  buyVolume: number;
}

interface RawSide {
  min?: string | number;
  max?: string | number;
  volume?: string | number;
  orderCount?: string | number;
}

interface RawAggregate {
  buy?: RawSide;
  sell?: RawSide;
}

type RawAggregatesResponse = Record<string, RawAggregate>;

function toNumber(value: string | number | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * No orders on this side (missing entry or orderCount 0) reports as null,
 * not 0. Same for a malformed/missing price field even when orderCount is
 * positive (BUG #5) — a bad price must never silently coerce to 0 and flow
 * into build-vs-buy as "free."
 */
function parseSide(
  side: RawSide | undefined,
  priceField: 'min' | 'max'
): { price: number | null; volume: number } {
  if (!side || toNumber(side.orderCount) <= 0) return { price: null, volume: 0 };
  const price = Number(side[priceField]);
  return {
    price: Number.isFinite(price) && price > 0 ? price : null,
    volume: toNumber(side.volume),
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Whether `locationId` is one station or a whole region — Fuzzwork aggregates either. */
export type AggregateScope = 'station' | 'region';

async function fetchBatch(
  locationId: number,
  typeIds: number[],
  scope: AggregateScope
): Promise<RawAggregatesResponse> {
  const url = new URL(FUZZWORK_AGGREGATES_URL);
  url.searchParams.set(scope, String(locationId));
  url.searchParams.set('types', typeIds.join(','));

  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Fuzzwork aggregates request failed with status ${response.status}`);
  }
  return (await response.json()) as RawAggregatesResponse;
}

/**
 * Fetches per-station sell/buy aggregates for a batch of type IDs, chunking
 * requests past MAX_TYPES_PER_REQUEST. Every requested type ID is present in
 * the returned map, even when Fuzzwork has no data for it.
 */
export async function fetchAggregates(
  locationId: number,
  typeIds: number[],
  scope: AggregateScope = 'station'
): Promise<Map<number, HubAggregate>> {
  const result = new Map<number, HubAggregate>();
  if (typeIds.length === 0) return result;

  const batches = chunk(typeIds, MAX_TYPES_PER_REQUEST);
  const bodies = new Array<RawAggregatesResponse>(batches.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < batches.length) {
      const at = next++;
      bodies[at] = await fetchBatch(locationId, batches[at], scope);
    }
  }
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, worker));

  for (const [at, batch] of batches.entries()) {
    const body = bodies[at];
    for (const typeId of batch) {
      const raw = body[String(typeId)];
      const sell = parseSide(raw?.sell, 'min');
      const buy = parseSide(raw?.buy, 'max');
      result.set(typeId, {
        sellMin: sell.price,
        buyMax: buy.price,
        sellVolume: sell.volume,
        buyVolume: buy.volume,
      });
    }
  }

  return result;
}

/** How crowded one station's market is for a type right now: open orders and the units they hold. */
export interface HubOrderCounts {
  buyOrders: number;
  sellOrders: number;
  buyVolume: number;
  sellVolume: number;
}

/**
 * Open buy/sell order counts at one station, per type. Unlike `fetchAggregates`
 * this keeps the counts themselves (ESI's market history only counts traded
 * orders, and per region — never per hub). A type with no orders, or no entry,
 * reads as zero rather than unknown: Fuzzwork answers for every type it was asked.
 */
export async function fetchOrderCounts(
  stationId: number,
  typeIds: number[]
): Promise<Map<number, HubOrderCounts>> {
  const result = new Map<number, HubOrderCounts>();
  for (const batch of chunk(typeIds, MAX_TYPES_PER_REQUEST)) {
    const body = await fetchBatch(stationId, batch, 'station');
    for (const typeId of batch) {
      const raw = body[String(typeId)];
      result.set(typeId, {
        buyOrders: toNumber(raw?.buy?.orderCount),
        sellOrders: toNumber(raw?.sell?.orderCount),
        buyVolume: toNumber(raw?.buy?.volume),
        sellVolume: toNumber(raw?.sell?.volume),
      });
    }
  }
  return result;
}
