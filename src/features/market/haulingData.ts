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
 */
import { getUniverseType } from '@/esi/endpoints';
import { getOrderBook } from '@/features/market/orderBook';
import { loadPriceHistory } from '@/features/market/priceHistory';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import {
  buildSellLadder,
  estimateSale,
  summarizeDemand,
  type DemandSummary,
  type LadderLevel,
  type SaleEstimate,
} from '@/engine/market/haulingMarket';
import type { TypeMap } from '@/sde/types';

/** Destination lowest sell must beat origin lowest sell by this factor to be looked at. */
export const MIN_LISTED_GAP = 1.1;
export const MAX_PRICED_CANDIDATES = 80;
export const MAX_BOOK_CANDIDATES = 40;
/** Fees are not known here, so the history pass keeps anything that could clear a rough cut. */
const ROUGH_FEE_FACTOR = 0.94;
const MIN_RECENT_GAP = 1.03;
/** Books and history are 1 request each per item: stay well under `ESI_FANOUT_CONCURRENCY`. */
const SCAN_CONCURRENCY = 4;
const SCAN_CACHE_TTL_MS = 300_000;

export type HaulingStage = 'prices' | 'history' | 'books' | 'volumes';

export interface HaulingProgress {
  stage: HaulingStage;
  done: number;
  total: number;
}

export interface HaulingScanRow {
  typeId: number;
  name: string;
  /** m³ of one unit as hauled. */
  unitVolumeM3: number;
  /** The origin hub's sell ladder — what buying costs. */
  buyLadder: LadderLevel[];
  /** The destination hub's sell ladder — the competition. */
  destLadder: LadderLevel[];
  demand: DemandSummary;
  sale: SaleEstimate;
}

export interface HaulingScan {
  rows: HaulingScanRow[];
  /** How many items were looked at in the first pass. */
  scanned: number;
  fetchedAt: number;
}

export interface HaulingScanRequest {
  from: TradeHub;
  to: TradeHub;
  typeIds: readonly number[];
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

function cacheKey(request: HaulingScanRequest): string {
  const ids = request.typeIds;
  return `${request.from.id}>${request.to.id}:${ids.length}:${ids[0] ?? 0}:${ids[ids.length - 1] ?? 0}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Hauling scan aborted', 'AbortError');
}

async function resolveVolume(typeId: number, types: TypeMap): Promise<number> {
  const known = types[String(typeId)];
  if (known) return known.packagedVolume ?? known.volume;
  try {
    const { data } = await getUniverseType(typeId);
    return data?.packaged_volume ?? data?.volume ?? 0;
  } catch {
    return 0;
  }
}

async function stationLadder(hub: TradeHub, typeId: number): Promise<LadderLevel[]> {
  const { orders } = await getOrderBook(hub.regionId, typeId);
  return buildSellLadder(orders.filter((o) => o.location_id === hub.stationId));
}

export async function runHaulingScan(request: HaulingScanRequest): Promise<HaulingScan> {
  const { from, to, typeIds, types, onProgress, signal } = request;
  const today = request.today ?? new Date().toISOString().slice(0, 10);

  const cached = scanCache.get(cacheKey(request));
  if (cached && cached.expiresAt > Date.now()) return cached.scan;

  // 1. Prices.
  onProgress?.({ stage: 'prices', done: 0, total: 2 });
  const ids = [...typeIds];
  const fromPrices = await getHubPrices(from, ids);
  onProgress?.({ stage: 'prices', done: 1, total: 2 });
  const toPrices = await getHubPrices(to, ids);
  onProgress?.({ stage: 'prices', done: 2, total: 2 });
  throwIfAborted(signal);

  const anyOriginPrice = ids.some((id) => fromPrices.get(id)?.sellMin != null);
  if (ids.length > 0 && !anyOriginPrice) {
    throw new Error('Hub prices are unavailable right now.');
  }

  const priced = ids
    .map((typeId) => {
      const buy = fromPrices.get(typeId)?.sellMin ?? null;
      const sell = toPrices.get(typeId)?.sellMin ?? null;
      return { typeId, buy, gap: buy !== null && sell !== null ? sell / buy : 0 };
    })
    .filter((c) => c.buy !== null && c.gap >= MIN_LISTED_GAP)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, MAX_PRICED_CANDIDATES);

  // 2. History: drop what never sells or only sold below the origin price.
  const withHistory: { typeId: number; buy: number; demand: DemandSummary; proxy: number }[] = [];
  let historyDone = 0;
  onProgress?.({ stage: 'history', done: 0, total: priced.length });
  await mapWithConcurrencyLimit(priced, SCAN_CONCURRENCY, async (candidate) => {
    throwIfAborted(signal);
    try {
      const { points } = await loadPriceHistory(to.regionId, candidate.typeId);
      const demand = summarizeDemand(points, today);
      if (demand.recentSalePrice !== null && demand.dailyVolume > 0) {
        const proxy = (demand.recentSalePrice * ROUGH_FEE_FACTOR) / candidate.buy!;
        if (proxy >= MIN_RECENT_GAP) {
          withHistory.push({ typeId: candidate.typeId, buy: candidate.buy!, demand, proxy });
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

  // 3. Order books for the shortlist only.
  const rows: HaulingScanRow[] = [];
  let booksDone = 0;
  onProgress?.({ stage: 'books', done: 0, total: shortlist.length });
  await mapWithConcurrencyLimit(shortlist, SCAN_CONCURRENCY, async (candidate) => {
    throwIfAborted(signal);
    try {
      const [buyLadder, destLadder] = await Promise.all([
        stationLadder(from, candidate.typeId),
        stationLadder(to, candidate.typeId),
      ]);
      const sale = estimateSale({
        ladder: destLadder,
        dailyVolume: candidate.demand.dailyVolume,
        recentSalePrice: candidate.demand.recentSalePrice,
      });
      if (sale !== null && buyLadder.length > 0) {
        rows.push({
          typeId: candidate.typeId,
          name: types[String(candidate.typeId)]?.name ?? `#${candidate.typeId}`,
          unitVolumeM3: 0,
          buyLadder,
          destLadder,
          demand: candidate.demand,
          sale,
        });
      }
    } catch {
      // One failed book drops that item, not the scan.
    }
    booksDone += 1;
    onProgress?.({ stage: 'books', done: booksDone, total: shortlist.length });
  });

  // 4. Hauled volume, for the survivors only.
  let volumesDone = 0;
  onProgress?.({ stage: 'volumes', done: 0, total: rows.length });
  await mapWithConcurrencyLimit(rows, SCAN_CONCURRENCY, async (row) => {
    row.unitVolumeM3 = await resolveVolume(row.typeId, types);
    volumesDone += 1;
    onProgress?.({ stage: 'volumes', done: volumesDone, total: rows.length });
  });

  const scan: HaulingScan = { rows, scanned: ids.length, fetchedAt: Date.now() };
  scanCache.set(cacheKey(request), { scan, expiresAt: Date.now() + SCAN_CACHE_TTL_MS });
  return scan;
}
