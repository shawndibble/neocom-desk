/**
 * Fuzzwork market aggregates client — primary price source (ADR 0002).
 * https://market.fuzzwork.co.uk/aggregates/?station={id}&types={csv}
 *
 * Response values arrive as JSON strings and must be parsed. A type with no
 * orders on a side still gets a key back, but with orderCount 0 — that side's
 * price is reported as null, never coerced to 0.
 */

export const FUZZWORK_AGGREGATES_URL = 'https://market.fuzzwork.co.uk/aggregates/';

/** Fuzzwork batches queries poorly past this many type IDs per request. */
const MAX_TYPES_PER_REQUEST = 200;

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

/** No orders on this side (missing entry or orderCount 0) reports as null, not 0. */
function parseSide(
  side: RawSide | undefined,
  priceField: 'min' | 'max'
): { price: number | null; volume: number } {
  if (!side || toNumber(side.orderCount) <= 0) return { price: null, volume: 0 };
  return { price: toNumber(side[priceField]), volume: toNumber(side.volume) };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchBatch(stationId: number, typeIds: number[]): Promise<RawAggregatesResponse> {
  const url = new URL(FUZZWORK_AGGREGATES_URL);
  url.searchParams.set('station', String(stationId));
  url.searchParams.set('types', typeIds.join(','));

  const response = await fetch(url);
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
  stationId: number,
  typeIds: number[]
): Promise<Map<number, HubAggregate>> {
  const result = new Map<number, HubAggregate>();
  if (typeIds.length === 0) return result;

  for (const batch of chunk(typeIds, MAX_TYPES_PER_REQUEST)) {
    const body = await fetchBatch(stationId, batch);
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
