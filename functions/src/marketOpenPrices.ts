/**
 * Daily open prices (docs/context/decisions/20261018-121126-price-history-draws-daily-open-buy-and-sell.md):
 * for each tracked region and type, the highest buy order and the lowest sell
 * order standing at the end of a UTC day, read from EVE Ref's twice-hourly
 * market-order snapshots and stored one document per region and type in
 * `marketOpenPrices`.
 *
 * Pure and dependency-free (no Firestore, fetch or relative imports) so the
 * daily function and the one-off backfill script share exactly this code and
 * it runs under plain Node type stripping too.
 */

export const MARKET_OPEN_PRICES_COLLECTION = 'marketOpenPrices';
/** Days kept per document; the oldest entries drop first. */
export const MARKET_OPEN_PRICES_MAX_DAYS = 400;

/**
 * Tracked regions: the five Trade Hub regions (The Forge, Domain, Sinq
 * Laison, Heimatar, Metropolis), mirroring `TRADE_HUBS` in src/market/hubs.ts.
 * The one place to widen the set.
 */
export const MARKET_OPEN_PRICES_REGION_IDS: readonly number[] = [
  10000002, 10000043, 10000032, 10000030, 10000042,
];

/**
 * A day's snapshot with fewer priced types than this in any tracked region is
 * treated as a broken download. The smallest tracked regions (Domain, Sinq
 * Laison, Heimatar, Metropolis) measured 11k to 17k priced types on a real day,
 * so 2,000 cannot block a healthy region; it only catches a near-empty file.
 * The comparison with the previous run (`shrunkRegion`) catches a half-sized one.
 */
export const MIN_PAIRS_PER_REGION = 2000;

const EVEREF_ORDERS_BASE = 'https://data.everef.net/market-orders/history';

export interface OpenPrice {
  buy: number | null;
  sell: number | null;
}

export interface OpenPriceSeries {
  regionId: number;
  typeId: number;
  /** Ascending, unique `YYYY-MM-DD`. */
  dates: string[];
  /** Parallel to `dates`. */
  buy: Array<number | null>;
  /** Parallel to `dates`. */
  sell: Array<number | null>;
}

export function openPriceDocId(regionId: number, typeId: number): string {
  return `${regionId}_${typeId}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** The UTC date before `now`'s. */
export function previousUtcDate(now: Date): string {
  return new Date(now.getTime() - (now.getTime() % 86_400_000) - 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Inclusive list of dates `from`..`to`, ascending; empty when `to` precedes `from`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The directory listing for one UTC day of EVE Ref's snapshot history. */
export function dayIndexUrl(date: string): string {
  return `${EVEREF_ORDERS_BASE}/${date.slice(0, 4)}/${date}/index.json`;
}

export interface DaySnapshot {
  url: string;
  /** EVE Ref's `file_time`, e.g. `2026-10-17T23:45:06Z`. */
  fileTime: string;
}

/**
 * The last snapshot of `date` from that day's `index.json`: the file with the
 * greatest `file_time` on that UTC day, or `null` when the listing has none
 * (a missing day, a malformed body). Only `.csv.bz2` market-order files count.
 */
export function pickLastSnapshot(listing: unknown, date: string): DaySnapshot | null {
  if (typeof listing !== 'object' || listing === null) return null;
  const files = (listing as { files?: unknown }).files;
  if (!Array.isArray(files)) return null;
  let best: DaySnapshot | null = null;
  for (const file of files as unknown[]) {
    if (typeof file !== 'object' || file === null) continue;
    const { file_time: time, name, url } = file as Record<string, unknown>;
    if (typeof time !== 'string' || typeof url !== 'string') continue;
    if (typeof name !== 'string' || !name.endsWith('.csv.bz2')) continue;
    if (!time.startsWith(`${date}T`)) continue;
    if (!best || time > best.fileTime) best = { url, fileTime: time };
  }
  return best;
}

/**
 * EVE Ref snapshots every half hour, at :15 and :45, and lists each about five
 * minutes later. A snapshot from the day's last half hour (23:30 onward) is
 * the 23:45 one: the day's final.
 */
export function isFinalSlot(fileTime: string, date: string): boolean {
  return fileTime >= `${date}T23:30:00Z` && fileTime.startsWith(`${date}T`);
}

export type FinalSnapshotResult =
  | { final: true; snapshot: DaySnapshot }
  /** Nothing listed, or only an earlier snapshot while the 23:45 one may still be coming. */
  | { final: false; snapshot: DaySnapshot | null };

/**
 * The day's final snapshot, or why it is not known yet. The last listed
 * snapshot is final when it sits in the day's last slot, or when the next day
 * already has a snapshot listed: EVE Ref has moved on, so a skipped 23:45 slot
 * is never coming and the earlier one really is the day's last. Otherwise the
 * 23:45 snapshot may simply not be listed yet, and reading the earlier one
 * would store a price that is not the day's last. `fetchListing` returns the
 * parsed `index.json`, or `null` when there is none.
 */
export async function findFinalSnapshot(
  date: string,
  fetchListing: (url: string) => Promise<unknown>
): Promise<FinalSnapshotResult> {
  const snapshot = pickLastSnapshot(await fetchListing(dayIndexUrl(date)), date);
  if (!snapshot) return { final: false, snapshot: null };
  if (isFinalSlot(snapshot.fileTime, date)) return { final: true, snapshot };
  const next = addDays(date, 1);
  const movedOn = pickLastSnapshot(await fetchListing(dayIndexUrl(next)), next) !== null;
  return movedOn ? { final: true, snapshot } : { final: false, snapshot };
}

/**
 * Folds order rows into the best buy and best sell per tracked region and
 * type. Region-wide on purpose: every order in the region counts, wherever it
 * sits. Rows from untracked regions and malformed rows are ignored.
 */
export class OpenPriceFold {
  private readonly tracked: ReadonlySet<number>;
  private readonly prices = new Map<string, OpenPrice & { regionId: number; typeId: number }>();

  constructor(regionIds: readonly number[] = MARKET_OPEN_PRICES_REGION_IDS) {
    this.tracked = new Set(regionIds);
  }

  add(regionId: number, typeId: number, isBuy: boolean, price: number): void {
    if (!this.tracked.has(regionId)) return;
    if (!Number.isInteger(typeId) || !Number.isFinite(price) || price <= 0) return;
    const key = openPriceDocId(regionId, typeId);
    let entry = this.prices.get(key);
    if (!entry) {
      entry = { regionId, typeId, buy: null, sell: null };
      this.prices.set(key, entry);
    }
    if (isBuy) {
      if (entry.buy === null || price > entry.buy) entry.buy = price;
    } else if (entry.sell === null || price < entry.sell) {
      entry.sell = price;
    }
  }

  get size(): number {
    return this.prices.size;
  }

  entries(): IterableIterator<{ regionId: number; typeId: number } & OpenPrice> {
    return this.prices.values();
  }

  pairsByRegion(): Map<number, number> {
    const counts = new Map<number, number>();
    for (const regionId of this.tracked) counts.set(regionId, 0);
    for (const entry of this.prices.values()) {
      counts.set(entry.regionId, (counts.get(entry.regionId) ?? 0) + 1);
    }
    return counts;
  }
}

/**
 * The 'publish nothing' guard (the LP sync's style): a day is plausible only
 * when every tracked region has at least `MIN_PAIRS_PER_REGION` priced types.
 * Returns the reason it is not, or `null` when it is fine.
 */
export function implausibleReason(fold: OpenPriceFold, minPerRegion = MIN_PAIRS_PER_REGION) {
  for (const [regionId, count] of fold.pairsByRegion()) {
    if (count < minPerRegion) {
      return `region ${regionId} has ${count} priced types, expected at least ${minPerRegion}`;
    }
  }
  return null;
}

/** Doc `marketOpenPricesMeta/lastRun`: what the last published day looked like, for `shrunkRegion`. Admin-only (no rule matches it). */
export const MARKET_OPEN_PRICES_META_PATH = 'marketOpenPricesMeta/lastRun';

/** Priced-type count per region, as stored in the meta doc (string keys: Firestore field names). */
export function regionCounts(fold: OpenPriceFold): Record<string, number> {
  return Object.fromEntries([...fold.pairsByRegion()].map(([id, n]) => [String(id), n]));
}

/**
 * The second 'publish nothing' guard: names a tracked region whose priced-type
 * count fell under `minShare` of the previous published day's, or `null`. No
 * previous counts (first run) means nothing to compare. A real, lasting drop
 * must be accepted by deleting the meta doc.
 */
export function shrunkRegion(
  fold: OpenPriceFold,
  previous: Record<string, unknown> | null | undefined,
  minShare = 0.5
): string | null {
  if (!previous) return null;
  for (const [regionId, count] of fold.pairsByRegion()) {
    const before = previous[String(regionId)];
    if (typeof before === 'number' && before > 0 && count < before * minShare) {
      return `region ${regionId} has ${count} priced types, under ${minShare * 100}% of the previous run's ${before}`;
    }
  }
  return null;
}

export interface DayPrice extends OpenPrice {
  date: string;
}

/**
 * Merges `days` into a series (or starts one). Idempotent: a date already
 * present is replaced in place, so re-running a day never duplicates it.
 * Dates stay ascending and unique, and only the newest
 * `MARKET_OPEN_PRICES_MAX_DAYS` are kept. Days nobody supplied get no entry
 * (no invented nulls); a `null` only means that side had no orders that day.
 */
export function mergeDays(
  base: { regionId: number; typeId: number },
  existing: Pick<OpenPriceSeries, 'dates' | 'buy' | 'sell'> | null,
  days: readonly DayPrice[],
  maxDays = MARKET_OPEN_PRICES_MAX_DAYS
): OpenPriceSeries {
  const byDate = new Map<string, OpenPrice>();
  if (existing) {
    // Parallel arrays that disagree in length are trusted only up to the shortest.
    const n = Math.min(existing.dates.length, existing.buy.length, existing.sell.length);
    for (let i = 0; i < n; i++) {
      byDate.set(existing.dates[i], {
        buy: existing.buy[i] ?? null,
        sell: existing.sell[i] ?? null,
      });
    }
  }
  for (const day of days) byDate.set(day.date, { buy: day.buy, sell: day.sell });
  const dates = [...byDate.keys()].sort().slice(-maxDays);
  return {
    regionId: base.regionId,
    typeId: base.typeId,
    dates,
    buy: dates.map((d) => byDate.get(d)!.buy),
    sell: dates.map((d) => byDate.get(d)!.sell),
  };
}

/** One document's worth of new days, ready for `mergeDays`. */
export interface KeyedDays {
  regionId: number;
  typeId: number;
  days: DayPrice[];
}

/** Regroups per-day folds by document, days ascending. Folds may be passed in any order. */
export function groupByDocument(folds: ReadonlyMap<string, OpenPriceFold>): KeyedDays[] {
  const groups = new Map<string, KeyedDays>();
  for (const date of [...folds.keys()].sort()) {
    for (const e of folds.get(date)!.entries()) {
      const key = openPriceDocId(e.regionId, e.typeId);
      let group = groups.get(key);
      if (!group) {
        group = { regionId: e.regionId, typeId: e.typeId, days: [] };
        groups.set(key, group);
      }
      group.days.push({ date, buy: e.buy, sell: e.sell });
    }
  }
  return [...groups.values()];
}
