import {
  getHubPricesWithStatus,
  getAdjustedPrices,
  HUB_PRICE_TTL_MS,
  type PricesWithStatus,
} from '@/market/prices';
import {
  fetchSystemCostIndices,
  systemCostIndexByActivity,
  type CostIndexActivity,
} from '@/market/cost-index';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { regionalJobTaxPct } from '@/engine/industry/regionalTax';
import { GLOBAL_CACHE_CHARACTER_ID, readCachedEntries, writeCachedMany } from '@/esi/cache';
import type { SystemCostIndices } from '@/esi/endpoints';
import type { TradeHub } from '@/market/hubs';
import type { AdjustedPrices, HubPrices, IndustryActivity } from '@/engine/industry/types';
import { DEFAULT_PRICE_PERCENT } from '@/features/market/pricePercent';
import { atPercent } from '@/features/market/pagePricePercents';
import { hubPricesAtPercent } from '@/features/market/hubPricesAtPercent';

export interface MarketSnapshot {
  hubPrices: HubPrices;
  hubBuyPrices: HubPrices;
  hubSellVolumes: HubPrices;
  adjustedPrices: AdjustedPrices | null;
  averagePrices?: HubPrices | null;
  systemCostIndex: number | null;
  systemCostIndexMissing?: boolean;
  regionalTaxPct?: number;
  copyingCostIndex?: number | null;
  inventionCostIndex?: number | null;
  hubPricesUnreachable?: boolean;
}

const COST_INDEX_TTL_MS = HUB_PRICE_TTL_MS;

let rawCostIndexCache: { value: SystemCostIndices[]; expiresAt: number } | null = null;

let rawCostIndexInFlight: Promise<SystemCostIndices[] | null> | null = null;

let persistedGeneration = 0;

function persistedKey(): string {
  return persistedGeneration === 0
    ? 'industryCostIndices'
    : `industryCostIndices#${persistedGeneration}`;
}

export function clearCostIndexCache(): void {
  rawCostIndexCache = null;
  rawCostIndexInFlight = null;
  persistedGeneration += 1;
}

export async function loadSystemCostIndices(
  activity: CostIndexActivity,
  now: () => number = Date.now
): Promise<Map<number, number> | null> {
  const nowMs = now();
  let raw: SystemCostIndices[] | null;
  if (rawCostIndexCache && rawCostIndexCache.expiresAt > nowMs) {
    raw = rawCostIndexCache.value;
  } else {
    if (!rawCostIndexInFlight) {
      const load = loadRawCostIndices(nowMs);
      rawCostIndexInFlight = load;
      void load.finally(() => {
        if (rawCostIndexInFlight === load) rawCostIndexInFlight = null;
      });
    }
    raw = await rawCostIndexInFlight;
  }
  return raw ? systemCostIndexByActivity(raw, activity) : null;
}

async function loadRawCostIndices(nowMs: number): Promise<SystemCostIndices[] | null> {
  const generation = persistedGeneration;
  const key = persistedKey();
  let row: { value: SystemCostIndices[]; fetchedAt: number } | undefined;
  try {
    row = (await readCachedEntries<SystemCostIndices[]>(GLOBAL_CACHE_CHARACTER_ID, [key])).get(key);
  } catch {}
  if (generation === persistedGeneration && row && row.fetchedAt + COST_INDEX_TTL_MS > nowMs) {
    rawCostIndexCache = { value: row.value, expiresAt: row.fetchedAt + COST_INDEX_TTL_MS };
    return row.value;
  }
  let value: SystemCostIndices[];
  try {
    value = await fetchSystemCostIndices();
  } catch {
    return null;
  }
  if (generation !== persistedGeneration) return value;
  rawCostIndexCache = { value, expiresAt: nowMs + COST_INDEX_TTL_MS };
  void writeCachedMany(GLOBAL_CACHE_CHARACTER_ID, [[key, value]], nowMs).catch(() => {});
  return value;
}

export interface MarketSnapshotRequest {
  hub: TradeHub;
  typeIds: number[];
  costIndexSystemId?: number;
  activity?: IndustryActivity;
  pricePercent?: number;
}

const averagesAtPercent = new WeakMap<HubPrices, Map<number, HubPrices>>();

function averagePricesAt(average: HubPrices, percent: number): HubPrices {
  if (percent === DEFAULT_PRICE_PERCENT) return average;
  let byPercent = averagesAtPercent.get(average);
  if (!byPercent) {
    byPercent = new Map();
    averagesAtPercent.set(average, byPercent);
  }
  let scaled = byPercent.get(percent);
  if (!scaled) {
    scaled = hubPricesAtPercent(average, percent);
    byPercent.set(percent, scaled);
  }
  return scaled;
}

async function loadGlobalPrices(): Promise<{
  adjusted: AdjustedPrices;
  average: HubPrices;
} | null> {
  try {
    const global = await getAdjustedPrices();
    const adjusted: AdjustedPrices = {};
    const average: HubPrices = {};
    for (const [typeId, price] of global) {
      if (price.adjusted !== null) adjusted[typeId] = price.adjusted;
      if (price.average !== null) average[typeId] = price.average;
    }
    return { adjusted, average };
  } catch {
    return null;
  }
}

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

  const hubBatches = new Map<number, Promise<PricesWithStatus>>();
  for (const [stationId, group] of byStation) {
    hubBatches.set(stationId, getHubPricesWithStatus(group.hub, [...group.typeIds]));
  }

  const globalPrices = loadGlobalPrices();

  const costIndices = new Map<CostIndexActivity, Promise<Map<number, number> | null>>();
  const indicesFor = (activity: CostIndexActivity) => {
    if (!costIndices.has(activity)) costIndices.set(activity, loadSystemCostIndices(activity));
    return costIndices.get(activity)!;
  };
  for (const request of requests) indicesFor(request.activity ?? 'manufacturing');

  return requests.map(async (request) => {
    const { prices: hubAggregates, unreachable } = await hubBatches.get(request.hub.stationId)!;
    const hubPrices: HubPrices = {};
    const hubBuyPrices: HubPrices = {};
    const hubSellVolumes: HubPrices = {};
    const percent = request.pricePercent ?? DEFAULT_PRICE_PERCENT;
    for (const typeId of request.typeIds) {
      const aggregate = hubAggregates.get(typeId);
      if (!aggregate) continue;
      if (aggregate.sellMin !== null) hubPrices[typeId] = atPercent(aggregate.sellMin, percent);
      if (aggregate.buyMax !== null) hubBuyPrices[typeId] = atPercent(aggregate.buyMax, percent);
      hubSellVolumes[typeId] = aggregate.sellVolume;
    }

    const activity = request.activity ?? 'manufacturing';
    const systemId = request.costIndexSystemId ?? request.hub.systemId;
    const indexIn = async (forActivity: CostIndexActivity) => {
      const indices = await indicesFor(forActivity);
      return indices == null ? null : (indices.get(systemId) ?? 0);
    };
    const indices = await indicesFor(activity);
    const found = indices?.get(systemId);
    const systemCostIndexMissing = indices != null && found === undefined;
    const systemCostIndex = indices == null ? null : (found ?? 0);
    const [copyingCostIndex, inventionCostIndex] =
      activity === 'manufacturing'
        ? await Promise.all([indexIn('copying'), indexIn('invention')])
        : [undefined, undefined];

    const global = await globalPrices;
    const regionId = (await lookupSolarSystem(systemId))?.regionId;
    return {
      hubPrices,
      hubBuyPrices,
      hubSellVolumes,
      adjustedPrices: global?.adjusted ?? null,
      averagePrices: global ? averagePricesAt(global.average, percent) : null,
      systemCostIndex,
      systemCostIndexMissing,
      regionalTaxPct: regionalJobTaxPct(regionId),
      ...(copyingCostIndex !== undefined ? { copyingCostIndex, inventionCostIndex } : {}),
      hubPricesUnreachable: unreachable,
    };
  });
}

export function loadMarketSnapshot(
  hub: TradeHub,
  typeIds: number[],
  costIndexSystemId?: number,
  activity: IndustryActivity = 'manufacturing',
  pricePercent?: number
): Promise<MarketSnapshot> {
  return loadMarketSnapshots([{ hub, typeIds, costIndexSystemId, activity, pricePercent }])[0];
}
