/**
 * The Hauling Opportunities scan: from every tradable item under a market
 * category, down to a short list priced for a hauler.
 *
 * Two cheap passes narrow the field before the expensive one, because each
 * item that survives to the last pass costs ESI order-book requests
 * (ADR 0003 — no multi-type endpoint) and a scan over a whole category would
 * blow the request budget:
 *
 * 1. **Prices.** Fuzzwork aggregates at both hub stations (`getHubPrices`,
 *    batched and cached). Keep items dearer at the destination by a wide
 *    enough gap, most a trip could earn first (`priceScore`).
 * 2. **Demand.** This is where a dead market drops out — a huge listed gap on
 *    an item that never sells is the trap, and over a broad category the
 *    dearest, thinnest items fill the top of pass 1. Keep the
 *    `MAX_BOOK_CANDIDATES` best by what a lot could earn at the recent sale
 *    price (`historyScore`). Demand comes from the destination region's daily
 *    R2 object (`loadHaulingDemand`, issue #5344): every pass-1 survivor is
 *    summarised locally, no ESI call, no read cap, and the best 40 overall
 *    are kept. When that object is missing or stale, the fallback reads the
 *    region's ESI history per survivor (`loadPriceHistory`, cached until ESI's
 *    own daily rollover), in rank order in batches until
 *    `MAX_BOOK_CANDIDATES` items pass or the list runs out — never past
 *    `MAX_HISTORY_READS` reads — and keeps the best of those.
 * 3. **Order books.** The two hubs' books, turned into ladders and estimated by
 *    `engine/market/haulingMarket`. They come from each hub station's
 *    30-minute R2 object (`loadHaulingBooks`): every survivor is read locally, no
 *    ESI call, no cap. When an object is missing or stale, the fallback reads the
 *    best `MAX_BOOK_CANDIDATES` items' books from ESI (station-filtered).
 *
 * Demand is read from the destination's whole *region* history (ESI has no
 * per-station history) while the ladders are the hub *station's*; the popover
 * says so. Pure decisions live in the engine — this module only fetches and
 * adapts.
 *
 * In `instant` mode (sell straight into the destination's buy orders) pass 1
 * compares the origin's lowest sell with the destination's highest *buy*,
 * pass 2 is skipped — a buy order already standing is the demand, and Days to
 * Sell does not apply; the shortlist keeps pass 1's order, scored against the
 * destination's buy-side volume — and pass 3 reads the destination's buy
 * ladder at the hub station.
 *
 * One end may be _Any hub_ (`ANY_HUB`): pass 1 then prices every hub's
 * aggregates (one cheap call per hub) and keeps each item on its single best
 * lane by that pass's score; passes 2 and 3 read that lane's hubs. The caps stay
 * overall, not per lane — at most `MAX_BOOK_CANDIDATES` items reach the
 * order-book pass whichever hubs they use — and each row says its lane.
 */
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

/** Destination lowest sell must beat origin lowest sell by this factor to be looked at. */
export const MIN_LISTED_GAP = 1.1;
/**
 * Destination highest buy must beat origin lowest sell by this factor. Lower
 * than the listed gap: the buy order is the price realised, not a ceiling a
 * listing will be undercut from, and only sales tax comes off it. Just above
 * 1 / (1 − 3.375%), Accounting V's tax: a smaller gap loses money at any
 * skill, so it would only spend order-book requests on rows that never show.
 */
export const MIN_INSTANT_GAP = 1.035;
/** Safety cap on destination-history reads (1 ESI request each, cached) in one list-mode scan. */
export const MAX_HISTORY_READS = 400;
export const MAX_BOOK_CANDIDATES = 40;
/** History reads go out in rank-ordered batches so the scan can stop once enough items pass. */
const HISTORY_BATCH = 20;
/** The history pass keeps anything whose recent sale price, after the rough fee, could clear this gap. */
const MIN_RECENT_GAP = 1.03;
/** Books and history are 1 request each per item: stay well under `ESI_FANOUT_CONCURRENCY`. */
const SCAN_CONCURRENCY = 4;
const SCAN_CACHE_TTL_MS = 300_000;

export type HaulingStage = 'prices' | 'history' | 'books';

export interface HaulingProgress {
  stage: HaulingStage;
  done: number;
  total: number;
}

/**
 * How the cargo is sold at the destination: `list` it for sale at the
 * Expected Sell Price, or sell it `instant`ly into the hub's buy orders.
 */
export const HAUL_MODES = ['list', 'instant'] as const;
export type HaulMode = (typeof HAUL_MODES)[number];

interface HaulingScanRowBase {
  typeId: number;
  name: string;
  /** The hub the item is bought at — the chosen one when From is Any. */
  fromHub: TradeHub;
  /** The hub the item is sold at — the chosen one when To is Any. */
  toHub: TradeHub;
  /** m³ of one unit as hauled. */
  unitVolumeM3: number;
  /** The item's SDE group and category, which decide the Specialised Holds it may ride in; null where unknown. */
  groupId: number | null;
  categoryId: number | null;
  /** The origin hub's sell ladder — what buying costs. */
  buyLadder: LadderLevel[];
  /** The destination hub's sell ladder — the competition. */
  destLadder: LadderLevel[];
  /** The destination hub station's buy ladder, dearest first — what an instant sale realises. */
  destBuyLadder: LadderLevel[];
}

export interface ListHaulingScanRow extends HaulingScanRowBase {
  mode: 'list';
  demand: DemandSummary;
  sale: SaleEstimate;
}

/** Sold into standing buy orders: no demand read and no Expected Sell Price — the orders are the price. */
export interface InstantHaulingScanRow extends HaulingScanRowBase {
  mode: 'instant';
}

export type HaulingScanRow = ListHaulingScanRow | InstantHaulingScanRow;

export interface HaulingScan {
  rows: HaulingScanRow[];
  /** How many items were looked at in the first pass. */
  scanned: number;
  /** List mode: where demand came from, the daily R2 object or the ESI fallback. Absent when no item reached the demand pass. */
  demandSource?: 'daily' | 'esi';
  /** Daily source only: how many items passed the demand check, of which the best `MAX_BOOK_CANDIDATES` got books. */
  demandPassed?: number;
  /** Where the order books came from: the 30-minute R2 snapshot or the ESI fallback. Absent when no item reached the books pass. */
  booksSource?: 'snapshot' | 'esi';
  /** Snapshot source only: when EVE Ref published the market snapshot the books were built from (ms). */
  booksAsOf?: number;
  /** True when the history-read or order-book cap cut the shortlist, so better-than-shown rows may exist unlooked-at. */
  capped?: boolean;
  /**
   * Ids past pass 1 not worth another look: dropped by history, or given books.
   * Cap-cut or history-read-failed ids stay out, so a later scan reaches them.
   */
  examinedTypeIds: number[];
  /** Items pass 1 would have kept but for Max price: the "cost more than your max price" count. */
  overMaxPrice: number;
  fetchedAt: number;
}

export interface HaulingScanRequest {
  from: HaulingEnd;
  to: HaulingEnd;
  typeIds: readonly number[];
  /** Which ids these are (a category id, or a fill's own string scope), so two id sets never share a cache entry. */
  scope: number | string;
  /** How the cargo is sold; defaults to `list`. */
  mode?: HaulMode;
  /** Max price per item: a lane whose origin price is above it is never ranked, so the caps go to affordable items. */
  maxUnitPrice?: number | null;
  types: TypeMap;
  /** SDE groupID -> categoryID (`groupCategories.json`); without it every row's category is unknown. */
  groupCategories?: Readonly<Record<string, number>>;
  /** ISO date the demand window ends on. */
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

/** Drops one scan's cache entry (by `haulingScanCacheKey`), leaving every other lane's. */
export function evictHaulingScan(key: string): void {
  scanCache.delete(key);
}

/** A scan is cached per route (Any included), category, mode and Max price: each keeps different rows for the same route. */
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

/**
 * The market catalogue: packaged volume for every market type (a container's
 * is a tenth of the assembled one `types.json` carries) and a name for the
 * market types `types.json` leaves out. Empty when it cannot load.
 */
function loadMarketCatalogue(): Promise<MarketCatalogue> {
  return loadMarketTypesById().catch(() => new Map());
}

/** m3 of one unit as hauled, or null when it cannot be told: a row with no volume must not become "0 m3", which would never fill a hold. */
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

/** The books object of every hub station the candidates use; null when any is unavailable, so one lane never runs on mixed sources. */
async function loadSnapshotBooks(
  candidates: readonly PricedCandidate[]
): Promise<Map<number, HaulingBooks> | null> {
  const stations = [
    ...new Set(candidates.flatMap((c) => [c.lane.from.stationId, c.lane.to.stationId])),
  ];
  const loaded = await Promise.all(stations.map((id) => loadHaulingBooks(id)));
  if (loaded.some((books) => books === null)) return null;
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
  /** Sort key: the trip-profit estimate from `engine/market/haulingRank`. */
  score: number;
  /** The price ratio the pass read — a tiebreak only, where scores tie (e.g. nothing listed scores 0). */
  gap: number;
}

interface PricedCandidate extends Ranked {
  /** Units for sale at the origin hub: what a lot can buy at most. */
  originListed: number;
}

interface ShortlistCandidate extends Ranked {
  demand: DemandSummary | null;
}

/** Best first: by score, then gap, then type id, so equal scores never order by fetch timing. */
function byRank(a: Ranked, b: Ranked): number {
  return b.score - a.score || b.gap - a.gap || a.typeId - b.typeId;
}

/** What the demand check keeps of one candidate, scored for the books cut; null when it never sold above the origin price. */
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

/** The daily demand object of every destination region the candidates use; null when any is unavailable, so one lane never runs on mixed sources. */
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
  const today = request.today ?? new Date().toISOString().slice(0, 10);
  const mode = request.mode ?? 'list';
  const maxUnitPrice = request.maxUnitPrice ?? null;
  const key = haulingScanCacheKey(request);

  const cached = scanCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.scan;

  const lanes = expandHaulingLane(haulingEndId(from), haulingEndId(to));
  if (lanes.length === 0) throw new Error('A hauling scan needs two different hubs.');

  // 1. Prices: once per hub the lanes touch, however many lanes share it.
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
  // Each item keeps only its best lane: the plan and the table are keyed by item.
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
  // The snapshot books answer for every candidate at once, so no book cap applies; the ESI fallback books a short list.
  const [books, dailyDemand] = await Promise.all([
    pricedAll.length > 0 ? loadSnapshotBooks(pricedAll) : null,
    mode === 'list' && pricedAll.length > 0 ? loadDailyDemand(pricedAll) : null,
  ]);
  throwIfAborted(signal);
  const bookCap = books ? Infinity : MAX_BOOK_CANDIDATES;
  // An instant sale skips history: the standing buy order is the demand, and pass 1's order is the shortlist.
  const withHistory: ShortlistCandidate[] =
    mode === 'instant' ? pricedAll.slice(0, bookCap).map((c) => ({ ...c, demand: null })) : [];
  // The daily object answers for every candidate at once; the ESI fallback reads a capped slice.
  const historyPass =
    mode === 'instant' ? [] : dailyDemand ? pricedAll : pricedAll.slice(0, MAX_HISTORY_READS);

  // 2. History: drop what never sells or only sold below the origin price,
  // feeding candidates in rank order until enough survive or none are left.
  let historyDone = 0;
  let historyNext = 0;
  // A read that failed for now (rate limit, network) is not a verdict: a later scan may look again.
  const historyUnread = new Set<number>();
  if (mode === 'list') onProgress?.({ stage: 'history', done: 0, total: historyPass.length });
  if (dailyDemand) {
    for (const candidate of historyPass) {
      const aggregate = dailyDemand.get(candidate.lane.to.regionId)?.types.get(candidate.typeId);
      // Absent from the object: it never traded in the window, so there is no demand to haul into.
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
        // ESI's 400 is "no market for this type": nothing to sell it for, for good.
        if (!(error instanceof EsiError && error.status === 400))
          historyUnread.add(candidate.typeId);
      }
      historyDone += 1;
      onProgress?.({ stage: 'history', done: historyDone, total: historyPass.length });
    });
  }
  // Stopped early once enough passed: close the bar on what was actually read.
  if (mode === 'list') onProgress?.({ stage: 'history', done: historyDone, total: historyDone });
  withHistory.sort(byRank);
  const shortlist = withHistory.slice(0, bookCap);

  // 3. Order books, then hauled volume, for the shortlist.
  const ladders = async (hub: TradeHub, typeId: number) => {
    const snapshot = books?.get(hub.stationId)?.types.get(typeId);
    // Absent from the snapshot: no orders at the station, so an empty book.
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
      // The market catalogue carries no SDE group: a type only it names rides in the general hold.
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
    } catch {
      // One failed book drops that item, not the scan.
    }
    booksDone += 1;
    onProgress?.({ stage: 'books', done: booksDone, total: shortlist.length });
  });

  // Cut = candidates left unlooked-at, by the book cap (enough passed) or the read cap.
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
  // An abandoned scan never lands: its caller moved on, and a later one must not be answered from it.
  throwIfAborted(signal);
  writeScanCache(key, scan);
  return scan;
}
