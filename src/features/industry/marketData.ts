/**
 * Adapts src/market lookups to the flat shapes src/engine/industry expects,
 * and adds a small in-memory TTL cache for system cost indices (the ESI
 * endpoint returns every system in one call; src/market has no cache for it,
 * unlike hub prices / adjusted prices which are already cached there).
 *
 * `adjustedPrices`/`systemCostIndex` are `null` only when the live ESI call
 * itself failed (no local persistence for these — CONTEXT.md: "Data Age").
 * That is the app's offline signal for price-dependent Build Plan results;
 * hub prices never signal offline this way (src/market/prices.ts already
 * degrades unreachable Fuzzwork to per-type nulls, not a throw).
 */
import { getHubPrices, getAdjustedPrices, HUB_PRICE_TTL_MS } from '@/market/prices';
import { fetchSystemCostIndices } from '@/market/cost-index';
import type { TradeHub } from '@/market/hubs';
import type { AdjustedPrices, HubPrices } from '@/engine/industry/types';

export interface MarketSnapshot {
  /** Lowest sell at the hub, materials + product. Missing key = unpriceable at this hub. */
  hubPrices: HubPrices;
  /**
   * Highest buy at the hub, same type IDs as `hubPrices`. Unused by Build
   * Plan (buying materials is always priced at `hubPrices`, the sell side);
   * the LP store's "instant-sell to buy orders" revenue basis is what reads
   * this (`src/features/loyalty/offerRows.ts`'s `revenueHubPrices`).
   */
  hubBuyPrices: HubPrices;
  /** Global adjusted prices (job-cost EIV). Null when the live ESI call failed. */
  adjustedPrices: AdjustedPrices | null;
  /** Manufacturing cost index for the hub's system. Null when the live ESI call failed. */
  systemCostIndex: number | null;
}

/** Reuses the hub-price TTL: both are "how often do market conditions change" caches. */
const COST_INDEX_TTL_MS = HUB_PRICE_TTL_MS;

let costIndexCache: { value: Map<number, number>; expiresAt: number } | null = null;

/** Test-only: production callers rely on TTL expiry instead of clearing. */
export function clearCostIndexCache(): void {
  costIndexCache = null;
}

async function loadSystemCostIndices(
  now: () => number = Date.now
): Promise<Map<number, number> | null> {
  const nowMs = now();
  if (costIndexCache && costIndexCache.expiresAt > nowMs) return costIndexCache.value;
  try {
    const value = await fetchSystemCostIndices();
    costIndexCache = { value, expiresAt: nowMs + COST_INDEX_TTL_MS };
    return value;
  } catch {
    return null;
  }
}

/**
 * Fetches everything a Build Plan needs to price a job: hub sell prices for
 * the given type IDs (materials + product), global adjusted prices, and the
 * hub system's manufacturing cost index.
 */
export async function loadMarketSnapshot(
  hub: TradeHub,
  typeIds: number[]
): Promise<MarketSnapshot> {
  const hubAggregates = await getHubPrices(hub, typeIds);
  const hubPrices: HubPrices = {};
  const hubBuyPrices: HubPrices = {};
  for (const [typeId, aggregate] of hubAggregates) {
    if (aggregate.sellMin !== null) hubPrices[typeId] = aggregate.sellMin;
    if (aggregate.buyMax !== null) hubBuyPrices[typeId] = aggregate.buyMax;
  }

  let adjustedPrices: AdjustedPrices | null;
  try {
    const adjusted = await getAdjustedPrices();
    adjustedPrices = {};
    for (const [typeId, price] of adjusted) {
      if (price.adjusted !== null) adjustedPrices[typeId] = price.adjusted;
    }
  } catch {
    adjustedPrices = null;
  }

  const costIndices = await loadSystemCostIndices();
  const systemCostIndex = costIndices?.get(hub.systemId) ?? null;

  return { hubPrices, hubBuyPrices, adjustedPrices, systemCostIndex };
}
