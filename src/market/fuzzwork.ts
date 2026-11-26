import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { chunk } from '@/lib/chunk';

export const FUZZWORK_AGGREGATES_URL = 'https://market.fuzzwork.co.uk/aggregates/';

const MAX_TYPES_PER_REQUEST = 200;
const BATCH_CONCURRENCY = 4;

export interface HubAggregate {
  sellMin: number | null;
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

export interface HubOrderCounts {
  buyOrders: number;
  sellOrders: number;
  buyVolume: number;
  sellVolume: number;
}

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
