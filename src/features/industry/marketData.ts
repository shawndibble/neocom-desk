/**
 * Adapts src/market lookups to the flat shapes src/engine/industry expects,
 * and adds a small in-memory TTL cache for system cost indices (the ESI
 * endpoint returns every system in one call; src/market has no cache for it,
 * unlike hub prices / adjusted prices which are already cached there).
 *
 * `loadMarketSnapshots` is the batching entry point — one fetch per distinct
 * hub for a whole set of plans; `loadMarketSnapshot` is its single-plan face.
 *
 * `adjustedPrices`/`systemCostIndex` are `null` only when the live ESI call
 * itself failed (no local persistence for these — CONTEXT.md: "Data Age").
 * That is the app's offline signal for price-dependent Build Plan results;
 * hub prices never signal offline this way (src/market/prices.ts already
 * degrades unreachable Fuzzwork to per-type nulls, not a throw).
 */
import {
  getHubPrices,
  getAdjustedPrices,
  HUB_PRICE_TTL_MS,
  type HubAggregate,
} from '@/market/prices';
import { fetchSystemCostIndices, systemCostIndexByActivity } from '@/market/cost-index';
import type { SystemCostIndices } from '@/esi/endpoints';
import type { TradeHub } from '@/market/hubs';
import type { AdjustedPrices, HubPrices, IndustryActivity } from '@/engine/industry/types';

export interface MarketSnapshot {
  /** Lowest sell at the hub, materials + product. Missing key = unpriceable at this hub. */
  hubPrices: HubPrices;
  /**
   * Highest buy at the hub, same type IDs as `hubPrices`. Read by a Build Plan
   * whose material price basis is `'buy'` (see `priceBasis.ts`) and by the LP
   * store's "instant-sell to buy orders" revenue basis
   * (`src/features/loyalty/offerRows.ts`'s `revenueHubPrices`). Both sides
   * come out of the one aggregate below, so choosing between them is never a
   * reason to fetch again.
   */
  hubBuyPrices: HubPrices;
  /** Global adjusted prices (job-cost EIV). Null when the live ESI call failed. */
  adjustedPrices: AdjustedPrices | null;
  /**
   * Manufacturing cost index for the system the job runs in — `costIndexSystemId`
   * when the caller names one, else the hub's own system. Null when the live ESI
   * call failed, or when the named system has no index (an unknown or
   * industry-less system).
   */
  systemCostIndex: number | null;
}

/** Reuses the hub-price TTL: both are "how often do market conditions change" caches. */
const COST_INDEX_TTL_MS = HUB_PRICE_TTL_MS;

/**
 * One raw fetch shared by every activity — ESI returns every system's full
 * `cost_indices` list in one call, so a manufacturing plan and a reaction
 * plan open in the same TTL window derive their two different numbers from
 * the same cached response rather than each fetching and parsing it again
 * (issue #460).
 */
let rawCostIndexCache: { value: SystemCostIndices[]; expiresAt: number } | null = null;

/** Test-only: production callers rely on TTL expiry instead of clearing. */
export function clearCostIndexCache(): void {
  rawCostIndexCache = null;
}

async function loadSystemCostIndices(
  activity: IndustryActivity,
  now: () => number = Date.now
): Promise<Map<number, number> | null> {
  const nowMs = now();
  if (!rawCostIndexCache || rawCostIndexCache.expiresAt <= nowMs) {
    try {
      const value = await fetchSystemCostIndices();
      rawCostIndexCache = { value, expiresAt: nowMs + COST_INDEX_TTL_MS };
    } catch {
      return null;
    }
  }
  return systemCostIndexByActivity(rawCostIndexCache.value, activity);
}

/** One plan's worth of pricing inputs — what a single `MarketSnapshot` answers. */
export interface MarketSnapshotRequest {
  hub: TradeHub;
  typeIds: number[];
  /** Where the job runs, when that isn't the hub's own system. */
  costIndexSystemId?: number;
  activity?: IndustryActivity;
}

/** Never rejects: a dead ESI is the offline signal, not an error to propagate. */
async function loadAdjustedPrices(): Promise<AdjustedPrices | null> {
  try {
    const adjusted = await getAdjustedPrices();
    const prices: AdjustedPrices = {};
    for (const [typeId, price] of adjusted) {
      if (price.adjusted !== null) prices[typeId] = price.adjusted;
    }
    return prices;
  } catch {
    return null;
  }
}

/**
 * Prices a whole set of plans at once: every request sharing a hub is served
 * by **one** Fuzzwork fetch over the union of their type ids, and the whole
 * batch shares one adjusted-price and one cost-index fetch (issue #628).
 *
 * The multi-plan views made the per-plan shape bite: `ESI_FANOUT_CONCURRENCY`
 * bounds how many snapshot loads run at once, not how many happen, so a
 * 25-member Build Group — which is single-hub by construction, every member
 * created from one `defaultsFrom` — issued 25 fetches where one does. Nothing
 * deduplicated them: `getHubPrices` caches by (station, type) *after* a fetch
 * resolves, so 25 concurrent cold-cache callers all miss and all fetch.
 *
 * Returns one promise per request, in request order, rather than one promise
 * for the array. A hub whose fetch fails must fail only its own requests —
 * every compared plan reports its own row, and one plan's failure never drops
 * another (issue #453) — which a single `Promise<MarketSnapshot[]>` could not
 * express without a result-union type.
 *
 * Each request still sees only its own type ids: unioning is a fetch-level
 * concern, and a plan reading prices for another plan's materials would be a
 * different question than the one it asked.
 */
export function loadMarketSnapshots(
  requests: readonly MarketSnapshotRequest[]
): Promise<MarketSnapshot>[] {
  if (requests.length === 0) return [];

  const byStation = new Map<number, { hub: TradeHub; typeIds: Set<number> }>();
  for (const request of requests) {
    let group = byStation.get(request.hub.stationId);
    if (!group) {
      group = { hub: request.hub, typeIds: new Set() };
      byStation.set(request.hub.stationId, group);
    }
    for (const typeId of request.typeIds) group.typeIds.add(typeId);
  }

  const hubBatches = new Map<number, Promise<Map<number, HubAggregate>>>();
  for (const [stationId, group] of byStation) {
    hubBatches.set(stationId, getHubPrices(group.hub, [...group.typeIds]));
  }

  const adjustedPrices = loadAdjustedPrices();

  // Distinct activities resolve in sequence, not in parallel: the raw ESI
  // response is cached by value once it lands, so two activities racing a
  // cold cache would fetch it twice — exactly the fan-out this function
  // exists to remove, one endpoint over.
  const costIndices = new Map<IndustryActivity, Promise<Map<number, number> | null>>();
  let chain: Promise<unknown> = Promise.resolve();
  for (const request of requests) {
    const activity = request.activity ?? 'manufacturing';
    if (costIndices.has(activity)) continue;
    const indices = chain.then(() => loadSystemCostIndices(activity));
    costIndices.set(activity, indices);
    chain = indices;
  }

  return requests.map(async (request) => {
    const hubAggregates = await hubBatches.get(request.hub.stationId)!;
    const hubPrices: HubPrices = {};
    const hubBuyPrices: HubPrices = {};
    for (const typeId of request.typeIds) {
      const aggregate = hubAggregates.get(typeId);
      if (!aggregate) continue;
      if (aggregate.sellMin !== null) hubPrices[typeId] = aggregate.sellMin;
      if (aggregate.buyMax !== null) hubBuyPrices[typeId] = aggregate.buyMax;
    }

    const indices = await costIndices.get(request.activity ?? 'manufacturing')!;
    const systemCostIndex = indices?.get(request.costIndexSystemId ?? request.hub.systemId) ?? null;

    return { hubPrices, hubBuyPrices, adjustedPrices: await adjustedPrices, systemCostIndex };
  });
}

/**
 * Fetches everything a Build Plan needs to price a job: hub sell prices for
 * the given type IDs (materials + product), global adjusted prices, and the
 * manufacturing cost index of the system the job runs in.
 *
 * `costIndexSystemId` is separate from the hub for a reason: where a player
 * sells and where they build are routinely different systems, and the job fee
 * is charged by the build system alone. Callers with no build system of their
 * own (the LP store, planetary plans) omit it and keep the hub's index, which
 * is what every caller got before the argument existed.
 *
 * `activity` picks which of ESI's per-activity indices to read (issue #460);
 * every caller before reactions existed got 'manufacturing', so it defaults
 * to that rather than becoming a required argument everywhere.
 *
 * The single-plan face of `loadMarketSnapshots` — a view pricing more than one
 * plan should call that instead, so its plans share a fetch.
 */
export function loadMarketSnapshot(
  hub: TradeHub,
  typeIds: number[],
  costIndexSystemId?: number,
  activity: IndustryActivity = 'manufacturing'
): Promise<MarketSnapshot> {
  return loadMarketSnapshots([{ hub, typeIds, costIndexSystemId, activity }])[0];
}
