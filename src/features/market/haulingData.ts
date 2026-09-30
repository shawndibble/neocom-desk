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
 *    enough gap, best gaps first, capped at `MAX_PRICED_CANDIDATES`.
 * 2. **History.** The destination region's daily history per survivor
 *    (`loadPriceHistory`, cached until ESI's own daily rollover). This is
 *    where a dead market drops out — a huge listed gap on an item that never
 *    sells is the trap. Keep the `MAX_BOOK_CANDIDATES` best by what they
 *    recently sold for against the origin price.
 * 3. **Order books.** The two hubs' books for those few, station-filtered,
 *    turned into ladders and estimated by `engine/market/haulingMarket`.
 *
 * Demand is read from the destination's whole *region* history (ESI has no
 * per-station history) while the ladders are the hub *station's*; the popover
 * says so. Pure decisions live in the engine — this module only fetches and
 * adapts.
 *
 * In `instant` mode (sell straight into the destination's buy orders) pass 1
 * compares the origin's lowest sell with the destination's highest *buy*,
 * pass 2 is skipped — a buy order already standing is the demand, and Days to
 * Sell does not apply — and pass 3 reads the destination's buy ladder at the
 * hub station.
 *
 * One end may be _Any hub_ (`ANY_HUB`): pass 1 then prices every hub's
 * aggregates (one cheap call per hub) and keeps each item on its single best
 * lane by that pass's gap; passes 2 and 3 read that lane's hubs. The caps stay
 * overall, not per lane — at most `MAX_BOOK_CANDIDATES` items reach the
 * order-book pass whichever hubs they use — and each row says its lane.
 */
import { getUniverseType } from '@/esi/endpoints';
import { getOrderBook } from '@/features/market/orderBook';
import { loadPriceHistory } from '@/features/market/priceHistory';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { ANY_HUB, expandHaulingLane, type HaulingHubChoice, type HubLane } from './haulingHubs';
import {
  estimateSale,
  hubLadders,
  summarizeDemand,
  type DemandSummary,
  type LadderLevel,
  type SaleEstimate,
} from '@/engine/market/haulingMarket';
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
export const MAX_PRICED_CANDIDATES = 80;
export const MAX_BOOK_CANDIDATES = 40;
/** Fees are not known here, so the history pass keeps anything that could clear a rough cut. */
const ROUGH_FEE_FACTOR = 0.94;
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
  fetchedAt: number;
}

/** One end of a scanned lane: a hub, or Any hub (at most one end). */
export type HaulingEnd = TradeHub | typeof ANY_HUB;

export function haulingEndId(end: HaulingEnd): HaulingHubChoice {
  return end === ANY_HUB ? ANY_HUB : end.id;
}

export interface HaulingScanRequest {
  from: HaulingEnd;
  to: HaulingEnd;
  typeIds: readonly number[];
  /** Which category the ids came from, so two categories can never share a cache entry. */
  scope: number;
  /** How the cargo is sold; defaults to `list`. */
  mode?: HaulMode;
  types: TypeMap;
  /** ISO date the demand window ends on. */
  today?: string;
  onProgress?: (progress: HaulingProgress) => void;
  signal?: AbortSignal;
}

const scanCache = new Map<string, { scan: HaulingScan; expiresAt: number }>();

export function clearHaulingScanCache(): void {
  scanCache.clear();
}

/** A scan is cached per route (Any included), category and mode: the two modes keep different rows for the same route. */
export function haulingScanCacheKey(
  request: Pick<HaulingScanRequest, 'from' | 'to' | 'scope' | 'mode'>
): string {
  return `${haulingEndId(request.from)}>${haulingEndId(request.to)}:${request.scope}:${request.mode ?? 'list'}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Hauling scan aborted', 'AbortError');
}

/** m3 of one unit as hauled, or null when it cannot be told: a row with no volume must not become "0 m3", which would never fill a hold. */
async function resolveVolume(typeId: number, types: TypeMap): Promise<number | null> {
  const known = types[String(typeId)];
  const fromCatalogue = known ? (known.packagedVolume ?? known.volume) : undefined;
  if (fromCatalogue !== undefined) return fromCatalogue > 0 ? fromCatalogue : null;
  try {
    const { data } = await getUniverseType(typeId);
    const volume = data?.packaged_volume ?? data?.volume;
    return volume !== undefined && volume > 0 ? volume : null;
  } catch {
    return null;
  }
}

async function stationLadders(
  hub: TradeHub,
  typeId: number
): Promise<{ sell: LadderLevel[]; buy: LadderLevel[] }> {
  const { orders } = await getOrderBook(hub.regionId, typeId);
  return hubLadders(orders, hub.stationId);
}

export async function runHaulingScan(request: HaulingScanRequest): Promise<HaulingScan> {
  const { from, to, typeIds, types, onProgress, signal } = request;
  const today = request.today ?? new Date().toISOString().slice(0, 10);
  const mode = request.mode ?? 'list';
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

  const minGap = mode === 'instant' ? MIN_INSTANT_GAP : MIN_LISTED_GAP;
  // Each item keeps only its best lane: the plan and the table are keyed by item.
  const priced = ids
    .flatMap((typeId) => {
      let best: { typeId: number; lane: HubLane; buy: number; gap: number } | null = null;
      for (const lane of lanes) {
        const buy = pricesAt.get(lane.from.id)?.get(typeId)?.sellMin ?? null;
        const dest = pricesAt.get(lane.to.id)?.get(typeId);
        const sell = (mode === 'instant' ? dest?.buyMax : dest?.sellMin) ?? null;
        if (buy === null || sell === null || buy <= 0) continue;
        const gap = sell / buy;
        if (gap >= minGap && (best === null || gap > best.gap)) best = { typeId, lane, buy, gap };
      }
      return best === null ? [] : [best];
    })
    .sort((a, b) => b.gap - a.gap)
    .slice(0, MAX_PRICED_CANDIDATES);

  // 2. History: drop what never sells or only sold below the origin price.
  // An instant sale skips it: the standing buy order is the demand.
  const withHistory: {
    typeId: number;
    lane: HubLane;
    buy: number;
    demand: DemandSummary | null;
    proxy: number;
  }[] =
    mode === 'instant'
      ? priced.map((c) => ({
          typeId: c.typeId,
          lane: c.lane,
          buy: c.buy,
          demand: null,
          proxy: c.gap,
        }))
      : [];
  let historyDone = 0;
  const historyPass = mode === 'instant' ? [] : priced;
  if (mode === 'list') onProgress?.({ stage: 'history', done: 0, total: priced.length });
  await mapWithConcurrencyLimit(historyPass, SCAN_CONCURRENCY, async (candidate) => {
    throwIfAborted(signal);
    try {
      const { points } = await loadPriceHistory(candidate.lane.to.regionId, candidate.typeId);
      const demand = summarizeDemand(points, today);
      if (demand.recentSalePrice !== null && demand.dailyVolume > 0) {
        const proxy = (demand.recentSalePrice * ROUGH_FEE_FACTOR) / candidate.buy;
        if (proxy >= MIN_RECENT_GAP) {
          withHistory.push({
            typeId: candidate.typeId,
            lane: candidate.lane,
            buy: candidate.buy,
            demand,
            proxy,
          });
        }
      }
    } catch {
      // No market history for this type at the destination: nothing to sell it for.
    }
    historyDone += 1;
    onProgress?.({ stage: 'history', done: historyDone, total: priced.length });
  });
  withHistory.sort((a, b) => b.proxy - a.proxy);
  const shortlist = withHistory.slice(0, MAX_BOOK_CANDIDATES);

  // 3. Order books, then hauled volume, for the shortlist only.
  const rows: HaulingScanRow[] = [];
  let booksDone = 0;
  onProgress?.({ stage: 'books', done: 0, total: shortlist.length });
  await mapWithConcurrencyLimit(shortlist, SCAN_CONCURRENCY, async (candidate) => {
    throwIfAborted(signal);
    try {
      const [origin, dest] = await Promise.all([
        stationLadders(candidate.lane.from, candidate.typeId),
        stationLadders(candidate.lane.to, candidate.typeId),
      ]);
      const buyLadder = origin.sell;
      const base = {
        typeId: candidate.typeId,
        name: types[String(candidate.typeId)]?.name ?? `#${candidate.typeId}`,
        fromHub: candidate.lane.from,
        toHub: candidate.lane.to,
        buyLadder,
        destLadder: dest.sell,
        destBuyLadder: dest.buy,
      };
      if (candidate.demand === null) {
        const unitVolumeM3 =
          buyLadder.length > 0 && dest.buy.length > 0
            ? await resolveVolume(candidate.typeId, types)
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
            ? await resolveVolume(candidate.typeId, types)
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

  const scan: HaulingScan = { rows, scanned: ids.length, fetchedAt: Date.now() };
  scanCache.set(key, { scan, expiresAt: Date.now() + SCAN_CACHE_TTL_MS });
  return scan;
}
