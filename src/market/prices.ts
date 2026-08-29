/**
 * Build Plan price lookups: Fuzzwork primary, per-type null fallback when
 * Fuzzwork is unreachable (ADR 0002). In-memory TTL cache — no Dexie; prices
 * are estimates, re-fetched on a schedule rather than persisted.
 */
import { fetchAggregates, type HubAggregate } from './fuzzwork';
import { fetchAdjustedPrices, type AdjustedPrice } from './esiPrices';
import type { TradeHub } from './hubs';

export type { HubAggregate, AdjustedPrice };

export const HUB_PRICE_TTL_MS = 15 * 60 * 1000;
export const ADJUSTED_PRICE_TTL_MS = 60 * 60 * 1000;

/** Injectable so tests can move time without waiting on it. Defaults to wall-clock. */
export type Clock = () => number;

const NULL_AGGREGATE: HubAggregate = Object.freeze({
  sellMin: null,
  buyMax: null,
  sellVolume: 0,
  buyVolume: 0,
});

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

const hubPriceCache = new Map<string, CacheEntry<HubAggregate>>();
let adjustedPriceCache: CacheEntry<Map<number, AdjustedPrice>> | null = null;

function hubCacheKey(stationId: number, typeId: number): string {
  return `${stationId}:${typeId}`;
}

/** Test-only: production callers rely on TTL expiry instead of clearing. */
export function clearMarketPriceCache(): void {
  hubPriceCache.clear();
  adjustedPriceCache = null;
}

/**
 * Sell/buy aggregates for typeIds at hub, from cache where fresh. Falls back
 * to null prices per type (not a thrown error) when Fuzzwork is unreachable.
 */
export async function getHubPrices(
  hub: TradeHub,
  typeIds: number[],
  now: Clock = Date.now
): Promise<Map<number, HubAggregate>> {
  const result = new Map<number, HubAggregate>();
  const stale: number[] = [];
  const nowMs = now();

  for (const typeId of typeIds) {
    const cached = hubPriceCache.get(hubCacheKey(hub.stationId, typeId));
    if (cached && cached.expiresAt > nowMs) {
      result.set(typeId, cached.value);
    } else {
      stale.push(typeId);
    }
  }

  if (stale.length > 0) {
    let fetched: Map<number, HubAggregate> | null = null;
    try {
      // Chunked internally; a failure partway through discards earlier
      // batches too. Acceptable: the retry below re-fetches everything,
      // nothing gets cached as a false "no price".
      fetched = await fetchAggregates(hub.stationId, stale);
    } catch {
      // Fuzzwork unreachable: serve nulls for this call but cache nothing,
      // so the next refresh (open or manual button) retries instead of
      // pinning "no price" for the rest of the TTL.
    }
    for (const typeId of stale) {
      const value = fetched?.get(typeId) ?? NULL_AGGREGATE;
      if (fetched) {
        hubPriceCache.set(hubCacheKey(hub.stationId, typeId), {
          value,
          expiresAt: nowMs + HUB_PRICE_TTL_MS,
        });
      }
      result.set(typeId, value);
    }
  }

  return result;
}

/** Global adjusted/average prices (job-cost EIV), cached for an hour. */
export async function getAdjustedPrices(
  now: Clock = Date.now
): Promise<Map<number, AdjustedPrice>> {
  const nowMs = now();
  if (adjustedPriceCache && adjustedPriceCache.expiresAt > nowMs) {
    return adjustedPriceCache.value;
  }
  const value = await fetchAdjustedPrices();
  adjustedPriceCache = { value, expiresAt: nowMs + ADJUSTED_PRICE_TTL_MS };
  return value;
}
