import { getHubPrices, getHubPricesWithStatus } from '@/market/prices';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { loadCompressedOreTypeIds, loadOreAndIceTypeIds, loadTypes } from '@/sde/loadSde';
import { moonOwnerUnitPrice } from '@/engine/corpTaxBook/valuation';
import { oreFormTypeId } from '@/engine/miningTax/oreForm';
import { loadHubSnapshotRange } from '@/features/market/hubSnapshot';
import { readCompressedOre } from './oreForm';
import { resolveTaxUnitPrice, type TaxPriceSource } from '@/engine/miningTax/priceBasis';

export interface UnitPrices {
  prices: Map<number, number>;
  unpriced: Set<number>;
  sellFallback: Set<number>;
  sources?: Map<number, TaxPriceSource>;
  liveUnreachable?: boolean;
  moonOwner?: Map<number, number>;
}

export function hubForPayee(hubId: string | undefined): TradeHub {
  return TRADE_HUBS.find((hub) => hub.id === hubId) ?? DEFAULT_TRADE_HUB;
}

interface DatedHubResult {
  byDate: Map<string, UnitPrices>;
}

async function resolvePricesForHubAcrossDates(
  typeIds: readonly number[],
  hub: TradeHub,
  dates: readonly string[],
  compressed: boolean,
  withMoonOwner = false
): Promise<DatedHubResult> {
  const unique = [...new Set(typeIds)];
  const byDate = new Map<string, UnitPrices>();
  if (unique.length === 0 || dates.length === 0) return { byDate };

  const compressedByRaw = await loadCompressedOreTypeIds();
  const pricedTypeId = (typeId: number): number =>
    oreFormTypeId(typeId, compressedByRaw, compressed);
  const pricingTypeIds = [...new Set(unique.map(pricedTypeId))];

  const sortedDates = [...dates].sort();
  const start = sortedDates[0];
  const end = sortedDates[sortedDates.length - 1];

  const [{ saved }, live] = await Promise.all([
    loadHubSnapshotRange(start, end, pricingTypeIds, hub),
    getHubPricesWithStatus(hub, pricingTypeIds),
  ]);

  for (const date of sortedDates) {
    const savedForDate = saved.get(date);

    const prices = new Map<number, number>();
    const moonOwner = withMoonOwner ? new Map<number, number>() : undefined;
    const unpriced = new Set<number>();
    const sellFallback = new Set<number>();
    const sources = new Map<number, TaxPriceSource>();
    for (const typeId of unique) {
      const pid = pricedTypeId(typeId);
      const resolved = resolveTaxUnitPrice({
        saved: savedForDate?.get(pid),
        live: {
          buy: live.prices.get(pid)?.buyMax ?? null,
          sell: live.prices.get(pid)?.sellMin ?? null,
        },
      });
      const price = resolved.price ?? 0;
      prices.set(typeId, price);
      moonOwner?.set(typeId, moonOwnerUnitPrice(savedForDate?.get(pid)));
      sources.set(typeId, resolved.source);
      if (resolved.source === 'live-sell') sellFallback.add(typeId);
      if (price <= 0) unpriced.add(typeId);
    }
    byDate.set(date, {
      prices,
      unpriced,
      sellFallback,
      sources,
      liveUnreachable: live.unreachable,
      ...(moonOwner ? { moonOwner } : {}),
    });
  }
  return { byDate };
}

export async function loadUnitPricesOnDate(
  typeIds: readonly number[],
  hub: TradeHub,
  date: string,
  compressed = true
): Promise<UnitPrices> {
  const { byDate } = await resolvePricesForHubAcrossDates(typeIds, hub, [date], compressed);
  return byDate.get(date) ?? { prices: new Map(), unpriced: new Set(), sellFallback: new Set() };
}

export interface DatedUnitPrices {
  byHubAndDate: ReadonlyMap<TradeHub['id'], ReadonlyMap<string, ReadonlyMap<number, number>>>;
  unpricedByHub: ReadonlyMap<TradeHub['id'], ReadonlySet<number>>;
  unpriced: Set<number>;
  sellFallbackByHubAndDate: ReadonlyMap<TradeHub['id'], ReadonlyMap<string, ReadonlySet<number>>>;
  unreachableHubs?: ReadonlySet<TradeHub['id']>;
  sourcesByHubAndDate?: ReadonlyMap<
    TradeHub['id'],
    ReadonlyMap<string, ReadonlyMap<number, TaxPriceSource>>
  >;
  moonOwnerByHubAndDate?: ReadonlyMap<
    TradeHub['id'],
    ReadonlyMap<string, ReadonlyMap<number, number>>
  >;
}

const NO_PRICES: ReadonlyMap<number, number> = new Map();
const NO_TYPES: ReadonlySet<number> = new Set();
const NO_SOURCES: ReadonlyMap<number, TaxPriceSource> = new Map();

export function pricesAtHubOnDate(
  data: DatedUnitPrices,
  hubId: string | undefined,
  date: string
): ReadonlyMap<number, number> {
  const hub = hubForPayee(hubId);
  return (
    data.byHubAndDate.get(hub.id)?.get(date) ??
    data.byHubAndDate.get(DEFAULT_TRADE_HUB.id)?.get(date) ??
    NO_PRICES
  );
}

export function sellFallbackAtHubOnDate(
  data: DatedUnitPrices,
  hubId: string | undefined,
  date: string
): ReadonlySet<number> {
  const hub = hubForPayee(hubId);
  return (
    data.sellFallbackByHubAndDate.get(hub.id)?.get(date) ??
    data.sellFallbackByHubAndDate.get(DEFAULT_TRADE_HUB.id)?.get(date) ??
    NO_TYPES
  );
}

export function sourcesAtHubOnDate(
  data: DatedUnitPrices,
  hubId: string | undefined,
  date: string
): ReadonlyMap<number, TaxPriceSource> {
  const hub = hubForPayee(hubId);
  return (
    data.sourcesByHubAndDate?.get(hub.id)?.get(date) ??
    data.sourcesByHubAndDate?.get(DEFAULT_TRADE_HUB.id)?.get(date) ??
    NO_SOURCES
  );
}

export function moonOwnerPricesAtHubOnDate(
  data: DatedUnitPrices,
  hubId: string | undefined,
  date: string
): ReadonlyMap<number, number> {
  const hub = hubForPayee(hubId);
  return (
    data.moonOwnerByHubAndDate?.get(hub.id)?.get(date) ??
    data.moonOwnerByHubAndDate?.get(DEFAULT_TRADE_HUB.id)?.get(date) ??
    NO_PRICES
  );
}

export async function loadDatedUnitPricesByHub(
  typeIds: readonly number[],
  hubIds: Iterable<string | undefined>,
  dates: readonly string[],
  compressed = true,
  options: { moonOwner?: boolean } = {}
): Promise<DatedUnitPrices> {
  const hubs = new Map<TradeHub['id'], TradeHub>([[DEFAULT_TRADE_HUB.id, DEFAULT_TRADE_HUB]]);
  for (const hubId of hubIds) {
    const hub = hubForPayee(hubId);
    hubs.set(hub.id, hub);
  }

  const loaded = await Promise.all(
    [...hubs.values()].map(
      async (hub) =>
        [
          hub.id,
          await resolvePricesForHubAcrossDates(
            typeIds,
            hub,
            dates,
            compressed,
            options.moonOwner === true
          ),
        ] as const
    )
  );

  const byHubAndDate = new Map<TradeHub['id'], ReadonlyMap<string, ReadonlyMap<number, number>>>();
  const unpricedByHub = new Map<TradeHub['id'], ReadonlySet<number>>();
  const unpriced = new Set<number>();
  const sellFallbackByHubAndDate = new Map<
    TradeHub['id'],
    ReadonlyMap<string, ReadonlySet<number>>
  >();
  const sourcesByHubAndDate = new Map<
    TradeHub['id'],
    ReadonlyMap<string, ReadonlyMap<number, TaxPriceSource>>
  >();
  const unreachableHubs = new Set<TradeHub['id']>();
  const moonOwnerByHubAndDate = new Map<
    TradeHub['id'],
    ReadonlyMap<string, ReadonlyMap<number, number>>
  >();
  for (const [hubId, result] of loaded) {
    const sourcesByDate = new Map<string, ReadonlyMap<number, TaxPriceSource>>();
    const byDate = new Map<string, ReadonlyMap<number, number>>();
    const sellByDate = new Map<string, ReadonlySet<number>>();
    const moonOwnerByDate = new Map<string, ReadonlyMap<number, number>>();
    const hubUnpriced = new Set<number>();
    for (const [date, dayResult] of result.byDate) {
      if (dayResult.liveUnreachable) unreachableHubs.add(hubId);
      byDate.set(date, dayResult.prices);
      sellByDate.set(date, dayResult.sellFallback);
      if (dayResult.moonOwner) moonOwnerByDate.set(date, dayResult.moonOwner);
      sourcesByDate.set(date, dayResult.sources ?? NO_SOURCES);
      for (const typeId of dayResult.unpriced) {
        hubUnpriced.add(typeId);
        unpriced.add(typeId);
      }
    }
    byHubAndDate.set(hubId, byDate);
    sellFallbackByHubAndDate.set(hubId, sellByDate);
    moonOwnerByHubAndDate.set(hubId, moonOwnerByDate);
    sourcesByHubAndDate.set(hubId, sourcesByDate);
    unpricedByHub.set(hubId, hubUnpriced);
  }
  return {
    byHubAndDate,
    unpricedByHub,
    unpriced,
    sellFallbackByHubAndDate,
    sourcesByHubAndDate,
    unreachableHubs,
    moonOwnerByHubAndDate,
  };
}

export async function oreUnitPrices(
  oreNames: readonly string[],
  hub: TradeHub
): Promise<{ prices: ReadonlyMap<string, number>; compressed: boolean }> {
  const [types, oreIds, compressedByRaw, compressed] = await Promise.all([
    loadTypes(),
    loadOreAndIceTypeIds(),
    loadCompressedOreTypeIds(),
    readCompressedOre(),
  ]);
  const wanted = new Set(oreNames);
  const rawByName = new Map<string, number>();
  for (const id of oreIds) {
    const name = types[String(id)]?.name;
    if (name !== undefined && wanted.has(name)) rawByName.set(name, id);
  }
  const priced = new Map(
    [...rawByName].map(([n, id]) => [n, oreFormTypeId(id, compressedByRaw, compressed)])
  );
  const aggregates = await getHubPrices(hub, [...new Set(priced.values())]);
  const prices = new Map<string, number>();
  for (const [name, typeId] of priced) {
    const buy = aggregates.get(typeId)?.buyMax;
    if (buy) prices.set(name, buy);
  }
  return { prices, compressed };
}
