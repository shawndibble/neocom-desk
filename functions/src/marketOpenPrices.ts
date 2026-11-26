export const MARKET_OPEN_PRICES_MAX_DAYS = 400;

export const MARKET_OPEN_PRICES_REGION_IDS: readonly number[] = [
  10000002, 10000043, 10000032, 10000030, 10000042,
];

export const MIN_PAIRS_PER_REGION = 2000;

const EVEREF_ORDERS_BASE = 'https://data.everef.net/market-orders/history';

export interface OpenPrice {
  buy: number | null;
  sell: number | null;
}

export interface OpenPriceSeries {
  buy: Array<number | null>;
  sell: Array<number | null>;
}

export interface TypeOpenPrices {
  typeId: number;
  dates: string[];
  stations: Record<string, OpenPriceSeries>;
}

export function openPriceDocId(typeId: number): string {
  return String(typeId);
}

export function pairKey(regionId: number, typeId: number): string {
  return `${regionId}_${typeId}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function previousUtcDate(now: Date): string {
  return new Date(now.getTime() - (now.getTime() % 86_400_000) - 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayIndexUrl(date: string): string {
  return `${EVEREF_ORDERS_BASE}/${date.slice(0, 4)}/${date}/index.json`;
}

export interface DaySnapshot {
  url: string;
  fileTime: string;
}

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

export function isFinalSlot(fileTime: string, date: string): boolean {
  return fileTime >= `${date}T23:30:00Z` && fileTime.startsWith(`${date}T`);
}

export type FinalSnapshotResult =
  { final: true; snapshot: DaySnapshot } | { final: false; snapshot: DaySnapshot | null };

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

export function implausibleReason(fold: OpenPriceFold, minPerRegion = MIN_PAIRS_PER_REGION) {
  for (const [regionId, count] of fold.pairsByRegion()) {
    if (count < minPerRegion) {
      return `region ${regionId} has ${count} priced types, expected at least ${minPerRegion}`;
    }
  }
  return null;
}

export function regionCounts(fold: OpenPriceFold): Record<string, number> {
  return Object.fromEntries([...fold.pairsByRegion()].map(([id, n]) => [String(id), n]));
}

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

export type PricePair = [number | null, number | null];

export interface StationPrice extends OpenPrice {
  stationId: number;
  typeId: number;
}

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

  get size(): number {
    let n = 0;
    for (const station of this.byStation.values()) n += station.size;
    return n;
  }

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

export interface TypeDay {
  date: string;
  stations: Record<string, OpenPrice>;
}

export interface TypeDays {
  typeId: number;
  days: TypeDay[];
}

export type StoredTypeOpenPrices = Partial<Pick<TypeOpenPrices, 'dates' | 'stations'>>;

function priceAt(values: unknown, i: number): number | null {
  if (!Array.isArray(values)) return null;
  const v: unknown = values[i];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

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
