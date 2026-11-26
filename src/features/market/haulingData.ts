import { loadTypeDetail } from '@/features/skills/typeDetail';
import { getOrderBook } from '@/features/market/orderBook';
import { loadPriceHistory } from '@/features/market/priceHistory';
import { loadHaulingDemand, type HaulingDemand } from '@/features/market/haulingDemand';
import { loadHaulingBooks, type HaulingBooks } from '@/features/market/haulingBooks';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { EsiError } from '@/esi/errors';
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { expandHaulingLane, haulingEndId, type HaulingEnd, type HubLane } from './haulingHubs';
import {
  historyScore,
  INSTANT_ROUGH_FEE_FACTOR,
  priceScore,
  ROUGH_FEE_FACTOR,
} from '@/engine/market/haulingRank';
import {
  demandFromAggregate,
  estimateSale,
  hubLadders,
  summarizeDemand,
  type DemandSummary,
  type LadderLevel,
  type SaleEstimate,
} from '@/engine/market/haulingMarket';
import { knownPackagedVolumeOf, type MarketTypeEntry } from '@/sde/marketTypes';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import type { TypeMap } from '@/sde/types';
import { utcDay } from '@/engine/localDay';

export const MIN_LISTED_GAP = 1.1;
export const MIN_INSTANT_GAP = 1.035;
export const MAX_HISTORY_READS = 400;
export const MAX_BOOK_CANDIDATES = 40;
const HISTORY_BATCH = 20;
const MIN_RECENT_GAP = 1.03;
const SCAN_CONCURRENCY = 4;
const SCAN_CACHE_TTL_MS = 300_000;

export type HaulingStage = 'prices' | 'history' | 'books';

export interface HaulingProgress {
  stage: HaulingStage;
  done: number;
  total: number;
}

export const HAUL_MODES = ['list', 'instant'] as const;
export type HaulMode = (typeof HAUL_MODES)[number];

interface HaulingScanRowBase {
  typeId: number;
  name: string;
  fromHub: TradeHub;
  toHub: TradeHub;
  unitVolumeM3: number;
  groupId: number | null;
  categoryId: number | null;
  buyLadder: LadderLevel[];
  destLadder: LadderLevel[];
  destBuyLadder: LadderLevel[];
}

export interface ListHaulingScanRow extends HaulingScanRowBase {
  mode: 'list';
  demand: DemandSummary;
  sale: SaleEstimate;
}

export interface InstantHaulingScanRow extends HaulingScanRowBase {
  mode: 'instant';
}

export type HaulingScanRow = ListHaulingScanRow | InstantHaulingScanRow;

export interface HaulingScan {
  rows: HaulingScanRow[];
  scanned: number;
  demandSource?: 'daily' | 'esi';
  demandPassed?: number;
  booksSource?: 'snapshot' | 'esi';
  booksAsOf?: number;
  capped?: boolean;
  examinedTypeIds: number[];
  overMaxPrice: number;
  fetchedAt: number;
}

export interface HaulingScanRequest {
  from: HaulingEnd;
  to: HaulingEnd;
  typeIds: readonly number[];
  scope: number | string;
  mode?: HaulMode;
  maxUnitPrice?: number | null;
  types: TypeMap;
  groupCategories?: Readonly<Record<string, number>>;
  today?: string;
  onProgress?: (progress: HaulingProgress) => void;
  signal?: AbortSignal;
}

const scanCache = new Map<string, { scan: HaulingScan; expiresAt: number }>();

export function clearHaulingScanCache(): void {
  scanCache.clear();
}

function writeScanCache(key: string, scan: HaulingScan): void {
  const now = Date.now();
  for (const [k, entry] of scanCache) if (entry.expiresAt <= now) scanCache.delete(k);
  scanCache.set(key, { scan, expiresAt: now + SCAN_CACHE_TTL_MS });
}

export function evictHaulingScan(key: string): void {
  scanCache.delete(key);
}

export function haulingScanCacheKey(
  request: Pick<HaulingScanRequest, 'from' | 'to' | 'scope' | 'mode' | 'maxUnitPrice'>
): string {
  const price = request.maxUnitPrice == null ? '' : `:max${request.maxUnitPrice}`;
  return `${haulingEndId(request.from)}>${haulingEndId(request.to)}:${request.scope}:${request.mode ?? 'list'}${price}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Hauling scan aborted', 'AbortError');
}

type MarketCatalogue = ReadonlyMap<number, MarketTypeEntry>;

function loadMarketCatalogue(): Promise<MarketCatalogue> {
  return loadMarketTypesById().catch(() => new Map());
}

async function resolveVolume(
  typeId: number,
  types: TypeMap,
  catalogue: MarketCatalogue
): Promise<number | null> {
  const packaged = knownPackagedVolumeOf(catalogue.get(typeId));
  if (packaged !== null && packaged > 0) return packaged;
  const known = types[String(typeId)];
  const fromCatalogue = known ? (known.packagedVolume ?? known.volume) : undefined;
  if (fromCatalogue !== undefined) return fromCatalogue > 0 ? fromCatalogue : null;
  const type = await loadTypeDetail(typeId);
  const volume = type?.packaged_volume ?? type?.volume;
  return volume !== undefined && volume > 0 ? volume : null;
}

async function loadSnapshotBooks(
  candidates: readonly PricedCandidate[]
): Promise<Map<number, HaulingBooks> | null> {
  const stations = [
    ...new Set(candidates.flatMap((c) => [c.lane.from.stationId, c.lane.to.stationId])),
  ];
  const loaded = await Promise.all(stations.map((id) => loadHaulingBooks(id)));
  const missing = stations.filter((_, i) => loaded[i] === null);
  if (missing.length > 0) {
    console.warn('[hauling-diag] retrying snapshot books', missing);
    const retried = await Promise.all(missing.map((id) => loadHaulingBooks(id)));
    missing.forEach((id, j) => {
      loaded[stations.indexOf(id)] = retried[j]!;
    });
  }
  if (loaded.some((books) => books === null)) {
    console.warn(
      '[hauling-diag] snapshot books unavailable',
      stations,
      loaded.map((b) => b !== null)
    );
    return null;
  }
  return new Map(stations.map((id, i) => [id, loaded[i]!]));
}

async function stationLadders(
  hub: TradeHub,
  typeId: number
): Promise<{ sell: LadderLevel[]; buy: LadderLevel[] }> {
  const { orders } = await getOrderBook(hub.regionId, typeId);
  return hubLadders(orders, hub.stationId);
}

interface Ranked {
  typeId: number;
  lane: HubLane;
  buy: number;
  score: number;
  gap: number;
}

interface PricedCandidate extends Ranked {
  originListed: number;
}

interface ShortlistCandidate extends Ranked {
  demand: DemandSummary | null;
}

function byRank(a: Ranked, b: Ranked): number {
  return b.score - a.score || b.gap - a.gap || a.typeId - b.typeId;
}

function withDemand(candidate: Ranked, demand: DemandSummary, originListed: number) {
  if (demand.recentSalePrice === null || !(demand.dailyVolume > 0)) return null;
  const recentGap = (demand.recentSalePrice * ROUGH_FEE_FACTOR) / candidate.buy;
  if (recentGap < MIN_RECENT_GAP) return null;
  return {
    typeId: candidate.typeId,
    lane: candidate.lane,
    buy: candidate.buy,
    demand,
    score: historyScore({
      buy: candidate.buy,
      recentSalePrice: demand.recentSalePrice,
      dailyVolume: demand.dailyVolume,
      originListed,
    }),
    gap: recentGap,
  } satisfies ShortlistCandidate;
}

async function loadDailyDemand(
  candidates: readonly PricedCandidate[]
): Promise<Map<number, HaulingDemand> | null> {
  const regionIds = [...new Set(candidates.map((c) => c.lane.to.regionId))];
  const loaded = await Promise.all(regionIds.map((id) => loadHaulingDemand(id)));
  if (loaded.some((demand) => demand === null)) return null;
  return new Map(regionIds.map((id, i) => [id, loaded[i]!]));
}

export async function runHaulingScan(request: HaulingScanRequest): Promise<HaulingScan> {
  const { from, to, typeIds, types, onProgress, signal } = request;
  const today = request.today ?? utcDay();
  const mode = request.mode ?? 'list';
  const maxUnitPrice = request.maxUnitPrice ?? null;
  const key = haulingScanCacheKey(request);

  const cached = scanCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.scan;

  const lanes = expandHaulingLane(haulingEndId(from), haulingEndId(to));
  if (lanes.length === 0) throw new Error('A hauling scan needs two different hubs.');

  const hubs = [...new Set(lanes.flatMap((lane) => [lane.from, lane.to]))];
  const ids = [...typeIds];
  let pricesDone = 0;
  onProgress?.({ stage: 'prices', done: 0, total: hubs.length });
  const priceEntries = await Promise.all(
    hubs.map(async (hub) => {
      const prices = await getHubPrices(hub, ids);
      pricesDone += 1;
      onProgress?.({ stage: 'prices', done: pricesDone, total: hubs.length });
      return [hub.id, prices] as const;
    })
  );
  const pricesAt = new Map(priceEntries);
  throwIfAborted(signal);

  const origins = [...new Set(lanes.map((lane) => lane.from))];
  const anyOriginPrice = ids.some((id) =>
    origins.some((hub) => pricesAt.get(hub.id)?.get(id)?.sellMin != null)
  );
  if (ids.length > 0 && !anyOriginPrice) {
    throw new Error('Hub prices are unavailable right now.');
  }

  const instant = mode === 'instant';
  const minGap = instant ? MIN_INSTANT_GAP : MIN_LISTED_GAP;
  const feeFactor = instant ? INSTANT_ROUGH_FEE_FACTOR : ROUGH_FEE_FACTOR;
  let overMaxPrice = 0;
  const pricedAll = ids
    .flatMap((typeId) => {
      let best: PricedCandidate | null = null;
      let cutByMaxPrice = false;
      for (const lane of lanes) {
        const origin = pricesAt.get(lane.from.id)?.get(typeId);
        const dest = pricesAt.get(lane.to.id)?.get(typeId);
        const buy = origin?.sellMin ?? null;
        const sell = (instant ? dest?.buyMax : dest?.sellMin) ?? null;
        if (buy === null || sell === null || buy <= 0) continue;
        const gap = sell / buy;
        if (gap < minGap) continue;
        if (maxUnitPrice !== null && buy > maxUnitPrice) {
          cutByMaxPrice = true;
          continue;
        }
        const originListed = origin?.sellVolume ?? 0;
        const destListed = (instant ? dest?.buyVolume : dest?.sellVolume) ?? 0;
        const score = priceScore({ buy, sell, originListed, destListed }, feeFactor);
        const candidate = { typeId, lane, buy, originListed, score, gap };
        if (best === null || byRank(candidate, best) < 0) best = candidate;
      }
      if (best === null && cutByMaxPrice) overMaxPrice += 1;
      return best === null ? [] : [best];
    })
    .sort(byRank);
  const [books, dailyDemand] = await Promise.all([
    pricedAll.length > 0 ? loadSnapshotBooks(pricedAll) : null,
    mode === 'list' && pricedAll.length > 0 ? loadDailyDemand(pricedAll) : null,
  ]);
  throwIfAborted(signal);
  const bookCap = books ? Infinity : MAX_BOOK_CANDIDATES;
  const withHistory: ShortlistCandidate[] =
    mode === 'instant' ? pricedAll.slice(0, bookCap).map((c) => ({ ...c, demand: null })) : [];
  const historyPass =
    mode === 'instant' ? [] : dailyDemand ? pricedAll : pricedAll.slice(0, MAX_HISTORY_READS);

  let historyDone = 0;
  let historyNext = 0;
  const historyUnread = new Set<number>();
  if (mode === 'list') onProgress?.({ stage: 'history', done: 0, total: historyPass.length });
  if (dailyDemand) {
    for (const candidate of historyPass) {
      const aggregate = dailyDemand.get(candidate.lane.to.regionId)?.types.get(candidate.typeId);
      const kept =
        aggregate && withDemand(candidate, demandFromAggregate(aggregate), candidate.originListed);
      if (kept) withHistory.push(kept);
    }
    historyNext = historyPass.length;
    historyDone = historyPass.length;
  }
  while (historyNext < historyPass.length && withHistory.length < bookCap) {
    const batch = historyPass.slice(historyNext, historyNext + HISTORY_BATCH);
    historyNext += batch.length;
    await mapWithConcurrencyLimit(batch, SCAN_CONCURRENCY, async (candidate) => {
      throwIfAborted(signal);
      try {
        const { points } = await loadPriceHistory(candidate.lane.to.regionId, candidate.typeId);
        const kept = withDemand(candidate, summarizeDemand(points, today), candidate.originListed);
        if (kept) withHistory.push(kept);
      } catch (error) {
        if (!(error instanceof EsiError && error.status === 400))
          historyUnread.add(candidate.typeId);
      }
      historyDone += 1;
      onProgress?.({ stage: 'history', done: historyDone, total: historyPass.length });
    });
  }
  if (mode === 'list') onProgress?.({ stage: 'history', done: historyDone, total: historyDone });
  withHistory.sort(byRank);
  const shortlist = withHistory.slice(0, bookCap);

  const ladders = async (hub: TradeHub, typeId: number) => {
    const snapshot = books?.get(hub.stationId)?.types.get(typeId);
    if (books) return snapshot ?? { sell: [], buy: [] };
    return stationLadders(hub, typeId);
  };
  const catalogue: MarketCatalogue = shortlist.length > 0 ? await loadMarketCatalogue() : new Map();
  const rows: HaulingScanRow[] = [];
  let booksDone = 0;
  onProgress?.({ stage: 'books', done: 0, total: shortlist.length });
  await mapWithConcurrencyLimit(shortlist, SCAN_CONCURRENCY, async (candidate) => {
    throwIfAborted(signal);
    try {
      const [origin, dest] = await Promise.all([
        ladders(candidate.lane.from, candidate.typeId),
        ladders(candidate.lane.to, candidate.typeId),
      ]);
      const buyLadder = origin.sell;
      const known = types[String(candidate.typeId)];
      const groupId = known?.groupID ?? null;
      const base = {
        typeId: candidate.typeId,
        name: known?.name ?? catalogue.get(candidate.typeId)?.name ?? `#${candidate.typeId}`,
        groupId,
        categoryId: groupId === null ? null : (request.groupCategories?.[String(groupId)] ?? null),
        fromHub: candidate.lane.from,
        toHub: candidate.lane.to,
        buyLadder,
        destLadder: dest.sell,
        destBuyLadder: dest.buy,
      };
      if (candidate.demand === null) {
        const unitVolumeM3 =
          buyLadder.length > 0 && dest.buy.length > 0
            ? await resolveVolume(candidate.typeId, types, catalogue)
            : null;
        if (unitVolumeM3 !== null) rows.push({ ...base, mode: 'instant', unitVolumeM3 });
      } else {
        const sale = estimateSale({
          ladder: dest.sell,
          dailyVolume: candidate.demand.dailyVolume,
          recentSalePrice: candidate.demand.recentSalePrice,
        });
        const unitVolumeM3 =
          sale !== null && buyLadder.length > 0
            ? await resolveVolume(candidate.typeId, types, catalogue)
            : null;
        if (sale !== null && unitVolumeM3 !== null) {
          rows.push({ ...base, mode: 'list', unitVolumeM3, demand: candidate.demand, sale });
        }
      }
    } catch {}
    booksDone += 1;
    onProgress?.({ stage: 'books', done: booksDone, total: shortlist.length });
  });

  const capped =
    mode === 'instant'
      ? pricedAll.length > bookCap
      : historyNext < pricedAll.length || withHistory.length > bookCap;
  const passedHistory = new Set(withHistory.map((c) => c.typeId));
  const examinedTypeIds = [
    ...historyPass
      .slice(0, historyNext)
      .filter((c) => !passedHistory.has(c.typeId) && !historyUnread.has(c.typeId))
      .map((c) => c.typeId),
    ...shortlist.map((c) => c.typeId),
  ];
  const scan: HaulingScan = {
    rows,
    scanned: ids.length,
    ...(capped ? { capped } : {}),
    ...(shortlist.length > 0
      ? {
          booksSource: books ? ('snapshot' as const) : ('esi' as const),
          ...(books ? { booksAsOf: Math.min(...[...books.values()].map((b) => b.asOf)) } : {}),
        }
      : {}),
    ...(mode === 'list' && pricedAll.length > 0
      ? {
          demandSource: dailyDemand ? ('daily' as const) : ('esi' as const),
          ...(dailyDemand ? { demandPassed: withHistory.length } : {}),
        }
      : {}),
    examinedTypeIds,
    overMaxPrice,
    fetchedAt: Date.now(),
  };
  throwIfAborted(signal);
  writeScanCache(key, scan);
  return scan;
}
