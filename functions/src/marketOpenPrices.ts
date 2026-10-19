/**
 * Daily open prices (docs/context/decisions/20261018-121126-price-history-draws-daily-open-buy-and-sell.md):
 * for each tracked region and type, the highest buy order and the lowest sell
 * order standing at the end of a UTC day, read from EVE Ref's twice-hourly
 * market-order snapshots and stored one object per type, holding every
 * tracked region, at `open-prices/<typeId>.json` in R2 (layout: decision
 * 20261018-164126-open-prices-one-document-per-type-every-hub; storage moved
 * from Firestore to R2 by 20261018-201511-moving-the-daily-snapshots-to-r2).
 *
 * Pure and dependency-free (no Firestore, fetch or relative imports) so the
 * daily function and the one-off backfill script share exactly this code and
 * it runs under plain Node type stripping too.
 */

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

/** One region's prices in a type document, parallel to its `dates`; `null` where that side had no order that day. */
export interface RegionOpenPrices {
  buy: Array<number | null>;
  sell: Array<number | null>;
}

/** One type's object, `open-prices/<typeId>.json` in R2. */
export interface TypeOpenPrices {
  typeId: number;
  /** Ascending, unique `YYYY-MM-DD`, shared by every region. */
  dates: string[];
  /** Keyed by region id; a region with no price in any kept day is absent. */
  regions: Record<string, RegionOpenPrices>;
}

export function openPriceDocId(typeId: number): string {
  return String(typeId);
}

/** The fold's key for one region and type. */
export function pairKey(regionId: number, typeId: number): string {
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
    const key = pairKey(regionId, typeId);
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

/** One day of one type: the regions that had a price, the others omitted. */
export interface TypeDay {
  date: string;
  regions: Record<string, OpenPrice>;
}

/** One document's worth of new days, ready for `mergeDays`. */
export interface TypeDays {
  typeId: number;
  days: TypeDay[];
}

function priceAt(values: unknown, i: number): number | null {
  if (!Array.isArray(values)) return null;
  const v: unknown = values[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Merges `days` into a type document (or starts one). Idempotent: a date
 * already present is replaced whole, every region with it, so re-running a
 * day never duplicates it. Dates stay ascending and unique, and only the
 * newest `MARKET_OPEN_PRICES_MAX_DAYS` are kept. Days nobody supplied get no
 * entry (no invented gaps); a `null` means that region had no order on that
 * side that day. A stored region array that falls short reads as null, and a
 * region left with no price at all is dropped.
 */
export function mergeDays(
  base: { typeId: number },
  existing: Pick<TypeOpenPrices, 'dates' | 'regions'> | null,
  days: readonly TypeDay[],
  maxDays = MARKET_OPEN_PRICES_MAX_DAYS
): TypeOpenPrices {
  const byDate = new Map<string, Map<string, OpenPrice>>();
  if (existing && Array.isArray(existing.dates)) {
    const stored =
      typeof existing.regions === 'object' && existing.regions !== null ? existing.regions : {};
    existing.dates.forEach((date, i) => {
      if (typeof date !== 'string') return;
      const regions = new Map<string, OpenPrice>();
      for (const [regionId, series] of Object.entries(stored)) {
        if (typeof series !== 'object' || series === null) continue;
        const buy = priceAt(series.buy, i);
        const sell = priceAt(series.sell, i);
        if (buy !== null || sell !== null) regions.set(regionId, { buy, sell });
      }
      if (regions.size > 0) byDate.set(date, regions);
    });
  }
  for (const day of days) byDate.set(day.date, new Map(Object.entries(day.regions)));
  const dates = [...byDate.keys()].sort().slice(-maxDays);
  const regionIds = new Set<string>();
  for (const date of dates) for (const id of byDate.get(date)!.keys()) regionIds.add(id);
  const regions: Record<string, RegionOpenPrices> = {};
  for (const id of [...regionIds].sort()) {
    regions[id] = {
      buy: dates.map((d) => byDate.get(d)!.get(id)?.buy ?? null),
      sell: dates.map((d) => byDate.get(d)!.get(id)?.sell ?? null),
    };
  }
  return { typeId: base.typeId, dates, regions };
}

/** Regroups per-day folds by type document, days ascending. Folds may be passed in any order. */
export function groupByDocument(folds: ReadonlyMap<string, OpenPriceFold>): TypeDays[] {
  const groups = new Map<number, TypeDays>();
  for (const date of [...folds.keys()].sort()) {
    const today = new Map<number, TypeDay>();
    for (const e of folds.get(date)!.entries()) {
      let day = today.get(e.typeId);
      if (!day) {
        day = { date, regions: {} };
        today.set(e.typeId, day);
        let group = groups.get(e.typeId);
        if (!group) {
          group = { typeId: e.typeId, days: [] };
          groups.set(e.typeId, group);
        }
        group.days.push(day);
      }
      day.regions[String(e.regionId)] = { buy: e.buy, sell: e.sell };
    }
  }
  return [...groups.values()];
}
