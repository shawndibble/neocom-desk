/**
 * Mining Yield Overview server-side price snapshot (issue #1279).
 *
 * Pure decision logic behind `captureMiningPriceSnapshot` in index.ts: date
 * math, URL building, response parsing, and the running-average merge. The
 * scheduled job itself (Firestore reads/writes, the `fetch` calls, the
 * inter-request delay) lives in index.ts, the same split `publicContracts.ts`
 * / `publicContractsArchive.ts` already use, so this module is
 * unit-testable from fixture JSON with no emulator.
 *
 * Two sources feed one collection, `marketHistory`, one doc per UTC date
 * (doc id === the date string):
 *
 * - Live capture (source: 'fuzzwork'): every 6 hours, this job reads
 *   Fuzzwork's market aggregates for all 5 major trade hubs and folds each
 *   capture into a running per-side average for *today's* doc. This is the
 *   real, station-level price — the same book `src/market/fuzzwork.ts`
 *   already reads for "today" client-side (ADR 0002) — captured server-side
 *   so it exists whether or not any pilot opened the app that day.
 * - One-time backfill (source: 'adam4eve'): a day that has no doc at all
 *   (older than this job's first run, or a run this job missed) is filled
 *   from Adam4EVE's `market_price_history`, a *region*-wide statistic, not
 *   station-level. Once the live capture has covered every day in the
 *   retention window (`MARKET_HISTORY_RETENTION_DAYS`, ~90 days after this
 *   ships), there is nothing left to backfill and this path goes idle.
 *
 * Because the two sources differ in reliability, a day's `source` tag
 * decides which price-basis tier it feeds client-side
 * (`src/engine/miningTax/priceBasis.ts`): 'fuzzwork' is real Jita station
 * data and is fed as `saved` (alongside/ahead of the per-browser Dexie
 * snapshot that already holds that tier); 'adam4eve' is a real buy/sell
 * split but region-wide, and is fed as the weaker `historical` tier, ahead
 * of ESI's single blended `average` but behind everything else.
 */
import { MINING_TYPE_IDS } from './data/miningTypeIds.js';

/**
 * Mirrors `TRADE_HUBS` in `src/market/hubs.ts` (station/region ids only —
 * this job never needs the display fields). `functions/` is a separate
 * package with no `@/` alias into `src/`, so this is kept as its own small,
 * hand-verified copy rather than imported cross-package. Verified against
 * that file 2026-09-25; re-check both if a hub ever changes.
 */
export const SNAPSHOT_HUBS = [
  { id: 'jita', stationId: 60003760, regionId: 10000002 },
  { id: 'amarr', stationId: 60008494, regionId: 10000043 },
  { id: 'dodixie', stationId: 60011866, regionId: 10000032 },
  { id: 'rens', stationId: 60004588, regionId: 10000030 },
  { id: 'hek', stationId: 60005686, regionId: 10000042 },
] as const;

/** The hub Adam4EVE backfill uses, and the only one the Overview's pricing reads today (`DEFAULT_TRADE_HUB` in `src/market/hubs.ts`). */
export const BACKFILL_HUB = SNAPSHOT_HUBS[0];

/** Every type_id this job prices: raw + compressed ore/ice/gas + reprocessing materials (`scripts/build-sde.mjs`). */
export const PRICED_TYPE_IDS: readonly number[] = MINING_TYPE_IDS;

/** Mirrors `LEDGER_HISTORY_DAYS` in `src/engine/miningTax/ledgerHistory.ts` — the ledger itself never asks about a day older than this. */
export const MARKET_HISTORY_RETENTION_DAYS = 90;

export interface SidePrices {
  buy: number | null;
  sell: number | null;
}

// ---------------------------------------------------------------------------
// Date helpers (a small local copy of src/engine/miningTax/yieldRange.ts's
// `shiftDate`/`eveToday` — same no-timezone-shift reasoning, no `@/` alias
// available to import it directly).
// ---------------------------------------------------------------------------

export function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftDateString(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Every date from `start` to `end`, inclusive, oldest first. */
export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; d = shiftDateString(d, 1)) dates.push(d);
  return dates;
}

/** Whether `date` has aged out of the retention window ending at `today` (today counted as day one). */
export function isOutsideRetention(date: string, today: string): boolean {
  return date < shiftDateString(today, -(MARKET_HISTORY_RETENTION_DAYS - 1));
}

/**
 * Days in the retention window (today excluded — that day is always live
 * capture, never backfill) with no doc at all yet, oldest first.
 */
export function missingBackfillDates(existingDates: ReadonlySet<string>, today: string): string[] {
  const start = shiftDateString(today, -(MARKET_HISTORY_RETENTION_DAYS - 1));
  const end = shiftDateString(today, -1);
  if (start > end) return [];
  return dateRange(start, end).filter((date) => !existingDates.has(date));
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// Fuzzwork (live capture) — mirrors src/market/fuzzwork.ts's parsing; kept
// as its own copy for the same no-`@/`-alias reason as SNAPSHOT_HUBS above.
// ---------------------------------------------------------------------------

export const FUZZWORK_AGGREGATES_URL = 'https://market.fuzzwork.co.uk/aggregates/';

/** Fuzzwork batches queries poorly past this many type IDs per request (matches src/market/fuzzwork.ts). */
export const FUZZWORK_TYPE_CHUNK_SIZE = 200;

interface RawFuzzworkSide {
  min?: string | number;
  max?: string | number;
  orderCount?: string | number;
}

interface RawFuzzworkAggregate {
  buy?: RawFuzzworkSide;
  sell?: RawFuzzworkSide;
}

type RawFuzzworkResponse = Record<string, RawFuzzworkAggregate>;

function toNumber(value: string | number | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** No orders on this side (missing entry or orderCount 0), or an unparsable/non-positive price, reports null rather than 0. */
function parseFuzzworkSide(side: RawFuzzworkSide | undefined, field: 'min' | 'max'): number | null {
  if (!side || toNumber(side.orderCount) <= 0) return null;
  const price = Number(side[field]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function buildFuzzworkUrl(stationId: number, typeIds: readonly number[]): string {
  const url = new URL(FUZZWORK_AGGREGATES_URL);
  url.searchParams.set('station', String(stationId));
  url.searchParams.set('types', typeIds.join(','));
  return url.toString();
}

/** Every requested type ID is present in the result, even when Fuzzwork has no data for it (both sides null). */
export function parseFuzzworkAggregates(
  body: unknown,
  typeIds: readonly number[]
): Map<number, SidePrices> {
  const parsed = (body ?? {}) as RawFuzzworkResponse;
  const result = new Map<number, SidePrices>();
  for (const typeId of typeIds) {
    const raw = parsed[String(typeId)];
    result.set(typeId, {
      buy: parseFuzzworkSide(raw?.buy, 'max'),
      sell: parseFuzzworkSide(raw?.sell, 'min'),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Adam4EVE (one-time historical backfill)
// ---------------------------------------------------------------------------

export const ADAM4EVE_HISTORY_URL = 'https://api.adam4eve.eu/v1/market_price_history';

/** Adam4EVE's own documented cap on typeIDs per `market_price_history` call. */
export const ADAM4EVE_TYPE_CHUNK_SIZE = 20;

/** Adam4EVE's documented rate limit: leave at least this long between calls. */
export const ADAM4EVE_MIN_REQUEST_GAP_MS = 5_000;

export function buildAdam4eveHistoryUrl(
  typeIds: readonly number[],
  regionId: number,
  start: string,
  end: string
): string {
  const url = new URL(ADAM4EVE_HISTORY_URL);
  url.searchParams.set('typeID', typeIds.join(','));
  url.searchParams.set('regionID', String(regionId));
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  return url.toString();
}

interface RawAdam4eveRow {
  type_id: string;
  price_date: string;
  buy_price_high?: string;
  sell_price_high?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses Adam4EVE's `market_price_history` rows into per-type per-date
 * buy/sell, using each side's `*_price_high` field.
 *
 * Verified 2026-09-25 against live Fuzzwork Jita aggregates for Tritanium
 * (34) and Compressed Bitumens (62454) across three same-day comparisons:
 * `buy_price_high`/`sell_price_high` tracked Jita's real buyMax/sellMin
 * within ~0.6% both times, while the sell side's `*_price_low` (2.97 vs
 * Jita's 3.77 for Tritanium; 932.6 vs 1139 for Compressed Bitumens) and
 * `*_price_avg` ran 15-20% low — Adam4EVE's numbers are region-wide, and
 * the region's cheapest sell listings are far-flung, near-zero-volume
 * outliers, not a price anyone actually gets at Jita. `_high` is the
 * well-supported end of the region's book, which is what happens to land
 * near Jita's. One field name for both sides, rather than a different pick
 * per side, is that same finding rather than an asymmetric guess.
 *
 * A row with a missing or unparsable price is kept with that side `null`,
 * never thrown — this feeds the optional `historical` price tier
 * (`priceBasis.ts`), which already falls back to ESI's average, the same
 * tolerance `loadPriceHistory` applies to a 400 from ESI's own history
 * endpoint. A row naming neither a recognizable type_id nor a date-shaped
 * `price_date` is dropped outright, since there is no key to file it under.
 */
export function parseAdam4eveHistoryResponse(json: unknown): Map<number, Map<string, SidePrices>> {
  const rows = Array.isArray(json) ? (json as RawAdam4eveRow[]) : [];
  const byType = new Map<number, Map<string, SidePrices>>();
  for (const row of rows) {
    const typeId = Number(row?.type_id);
    const date = row?.price_date;
    if (!Number.isFinite(typeId) || typeof date !== 'string' || !DATE_PATTERN.test(date)) continue;

    const buy = Number(row.buy_price_high);
    const sell = Number(row.sell_price_high);
    const byDate = byType.get(typeId) ?? new Map<string, SidePrices>();
    byDate.set(date, {
      buy: Number.isFinite(buy) && buy > 0 ? buy : null,
      sell: Number.isFinite(sell) && sell > 0 ? sell : null,
    });
    byType.set(typeId, byDate);
  }
  return byType;
}

// ---------------------------------------------------------------------------
// Firestore day-doc shape + the live-capture running average
// ---------------------------------------------------------------------------

export interface StoredHubPrice {
  buy: number | null;
  sell: number | null;
  /** How many captures have contributed to `buy`/`sell` respectively — a side with no orders this run doesn't count. */
  buyCount: number;
  sellCount: number;
}

/** One day's snapshot, keyed by station id then type id. */
export type StoredHubDay = Record<string, Record<string, StoredHubPrice>>;

export interface MarketHistoryDoc {
  hubs: StoredHubDay;
  source: 'fuzzwork' | 'adam4eve';
  updatedAt: number;
}

export const MARKET_HISTORY_COLLECTION = 'marketHistory';

function foldSide(
  existingValue: number | null | undefined,
  existingCount: number | undefined,
  capture: number | null
): { value: number | null; count: number } {
  const count = existingCount ?? 0;
  if (capture === null) return { value: existingValue ?? null, count };
  if (existingValue == null) return { value: capture, count: count + 1 };
  const nextCount = count + 1;
  return { value: existingValue + (capture - existingValue) / nextCount, count: nextCount };
}

/**
 * Folds one live capture into a running per-side average (issue #1279): the
 * job runs 4x/day, and letting a single 6-hour spike (a crash-dumped sell, a
 * one-off panic buy) set the whole day's price would trade one kind of wrong
 * number for another. A side with no orders this capture (`null`) leaves the
 * running average untouched — that means "unknown this one snapshot," not
 * "unpriced" — rather than folding in as if it were a real zero.
 */
export function foldHubPriceCapture(
  existing: StoredHubPrice | undefined,
  capture: SidePrices
): StoredHubPrice {
  const buy = foldSide(existing?.buy, existing?.buyCount, capture.buy);
  const sell = foldSide(existing?.sell, existing?.sellCount, capture.sell);
  return { buy: buy.value, sell: sell.value, buyCount: buy.count, sellCount: sell.count };
}
