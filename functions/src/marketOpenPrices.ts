/**
 * Daily open prices (docs/context/decisions/20261018-121126-price-history-draws-daily-open-buy-and-sell.md):
 * for each hub station and type, the highest buy order and the lowest sell
 * order placed at that station and standing at the end of a UTC day, read
 * from EVE Ref's twice-hourly market-order snapshots and stored one object
 * per type, holding every hub station, at `open-prices/<typeId>.json` in R2
 * (layout: decision 20261018-164126-open-prices-one-document-per-type-every-hub;
 * storage moved from Firestore to R2 by 20261018-201511-moving-the-daily-snapshots-to-r2;
 * station rather than region-wide since 20261019-004148-open-prices-at-the-hub-station-not-region).
 *
 * Pure and dependency-free (no Firestore, fetch or relative imports) so the
 * code stays trivially testable.
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

/** One station's prices in a type object, parallel to its `dates`; `null` where that side had no order that day. */
export interface OpenPriceSeries {
  buy: Array<number | null>;
  sell: Array<number | null>;
}

/** One type's object, `open-prices/<typeId>.json` in R2. */
export interface TypeOpenPrices {
  typeId: number;
  /** Ascending, unique `YYYY-MM-DD`, shared by every series. */
  dates: string[];
  /** Keyed by hub station id; a station with no price in any kept day is absent. */
  stations: Record<string, OpenPriceSeries>;
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
 * type: every order in the region counts, wherever it sits. Rows from
 * untracked regions and malformed rows are ignored. Since #4279 this is only
 * the snapshot's plausibility check (`implausibleReason`, `shrunkRegion`);
 * the stored prices come from `StationPriceFold`.
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

/** The five Trade Hubs, mirroring `TRADE_HUBS` in src/market/hubs.ts (`functionsParity.test.ts`). */
export const SNAPSHOT_HUBS = [
  { id: 'jita', stationId: 60003760, regionId: 10000002 },
  { id: 'amarr', stationId: 60008494, regionId: 10000043 },
  { id: 'dodixie', stationId: 60011866, regionId: 10000032 },
  { id: 'rens', stationId: 60004588, regionId: 10000030 },
  { id: 'hek', stationId: 60005686, regionId: 10000042 },
] as const;

export interface SnapshotHub {
  readonly id: string;
  readonly stationId: number;
}

/** `[buy, sell]`; a side with no order is null. */
export type PricePair = [number | null, number | null];

/** One station and type out of a `StationPriceFold`. */
export interface StationPrice extends OpenPrice {
  stationId: number;
  typeId: number;
}

/**
 * Best buy and sell per hub station and type, fed row by row during the
 * snapshot's single pass (decisions 20261018-233051 and 20261019-004148: the
 * Open Prices and the mining prices both come from it). Only orders *placed
 * at* the station count: a buy order's `range` is never read, so a
 * region-range buy placed elsewhere is not a station buy. `typeIds` narrows
 * the fold; without it every type is kept.
 */
export class StationPriceFold {
  private readonly stations: Set<number>;
  private readonly types: Set<number> | null;
  private readonly byStation = new Map<number, Map<number, PricePair>>();

  constructor(hubs: readonly SnapshotHub[], typeIds?: Iterable<number>) {
    this.stations = new Set(hubs.map((h) => h.stationId));
    this.types = typeIds ? new Set(typeIds) : null;
  }

  add(locationId: number, typeId: number, isBuy: boolean, price: number): void {
    if (!this.stations.has(locationId) || !Number.isInteger(typeId)) return;
    if (this.types && !this.types.has(typeId)) return;
    if (!Number.isFinite(price) || price <= 0) return;
    let station = this.byStation.get(locationId);
    if (!station) {
      station = new Map();
      this.byStation.set(locationId, station);
    }
    let pair = station.get(typeId);
    if (!pair) {
      pair = [null, null];
      station.set(typeId, pair);
    }
    if (isBuy) {
      if (pair[0] === null || price > pair[0]) pair[0] = price;
    } else if (pair[1] === null || price < pair[1]) {
      pair[1] = price;
    }
  }

  /** Station/type pairs with at least one side priced. */
  get size(): number {
    let n = 0;
    for (const station of this.byStation.values()) n += station.size;
    return n;
  }

  /** The station's prices by type id, optionally only `typeIds`; only types with at least one order. */
  prices(stationId: number, typeIds?: ReadonlySet<number>): Record<string, PricePair> {
    const out: Record<string, PricePair> = {};
    for (const [typeId, pair] of this.byStation.get(stationId) ?? []) {
      if (!typeIds || typeIds.has(typeId)) out[typeId] = [...pair];
    }
    return out;
  }

  *entries(): IterableIterator<StationPrice> {
    for (const [stationId, station] of this.byStation) {
      for (const [typeId, [buy, sell]] of station) yield { stationId, typeId, buy, sell };
    }
  }
}

/** One day of one type: the hub stations that had a price, the others omitted. */
export interface TypeDay {
  date: string;
  stations: Record<string, OpenPrice>;
}

/** One object's worth of new days, ready for `mergeDays`. */
export interface TypeDays {
  typeId: number;
  days: TypeDay[];
}

/** What `mergeDays` accepts as the stored object: possibly junk, so every field is optional. */
export type StoredTypeOpenPrices = Partial<Pick<TypeOpenPrices, 'dates' | 'stations'>>;

function priceAt(values: unknown, i: number): number | null {
  if (!Array.isArray(values)) return null;
  const v: unknown = values[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** The prices stored at index `i` of a `stations` map, keyed as stored. */
function pricesAt(stored: unknown, i: number): Map<string, OpenPrice> {
  const out = new Map<string, OpenPrice>();
  if (typeof stored !== 'object' || stored === null) return out;
  for (const [id, series] of Object.entries(stored)) {
    if (typeof series !== 'object' || series === null) continue;
    const { buy: buys, sell: sells } = series as Record<string, unknown>;
    const buy = priceAt(buys, i);
    const sell = priceAt(sells, i);
    if (buy !== null || sell !== null) out.set(id, { buy, sell });
  }
  return out;
}

function seriesOf(
  dates: readonly string[],
  byDate: ReadonlyMap<string, Map<string, OpenPrice>>
): Record<string, OpenPriceSeries> {
  const ids = new Set<string>();
  for (const date of dates) for (const id of byDate.get(date)!.keys()) ids.add(id);
  const out: Record<string, OpenPriceSeries> = {};
  for (const id of [...ids].sort()) {
    out[id] = {
      buy: dates.map((d) => byDate.get(d)!.get(id)?.buy ?? null),
      sell: dates.map((d) => byDate.get(d)!.get(id)?.sell ?? null),
    };
  }
  return out;
}

/**
 * Merges `days` into a type's object (or starts one). Idempotent: a date
 * already present is replaced whole, every station with it, so re-running a
 * day never duplicates it. Dates stay ascending and unique, and only the
 * newest `MARKET_OPEN_PRICES_MAX_DAYS` are kept. Days nobody supplied get no
 * entry (no invented gaps); a `null` means that station had no order on that
 * side that day. A stored array that falls short reads as null, and a station
 * left with no price at all is dropped.
 */
export function mergeDays(
  base: { typeId: number },
  existing: StoredTypeOpenPrices | null,
  days: readonly TypeDay[],
  maxDays = MARKET_OPEN_PRICES_MAX_DAYS
): TypeOpenPrices {
  const byDate = new Map<string, Map<string, OpenPrice>>();
  if (existing && Array.isArray(existing.dates)) {
    existing.dates.forEach((date, i) => {
      if (typeof date !== 'string') return;
      const stations = pricesAt(existing.stations, i);
      if (stations.size > 0) byDate.set(date, stations);
    });
  }
  for (const day of days) byDate.set(day.date, new Map(Object.entries(day.stations)));
  const dates = [...byDate.keys()].sort().slice(-maxDays);
  return { typeId: base.typeId, dates, stations: seriesOf(dates, byDate) };
}

/** Regroups per-day station folds by type object, days ascending. Folds may be passed in any order. */
export function groupByDocument(
  folds: ReadonlyMap<string, { entries(): Iterable<StationPrice> }>
): TypeDays[] {
  const groups = new Map<number, TypeDays>();
  for (const date of [...folds.keys()].sort()) {
    const today = new Map<number, TypeDay>();
    for (const e of folds.get(date)!.entries()) {
      let day = today.get(e.typeId);
      if (!day) {
        day = { date, stations: {} };
        today.set(e.typeId, day);
        let group = groups.get(e.typeId);
        if (!group) {
          group = { typeId: e.typeId, days: [] };
          groups.set(e.typeId, group);
        }
        group.days.push(day);
      }
      day.stations[String(e.stationId)] = { buy: e.buy, sell: e.sell };
    }
  }
  return [...groups.values()];
}
