/**
 * Mining prices at the five hub stations, folded from the same EVE Ref
 * end-of-day market-order snapshot `syncMarketOpenPrices` already reads
 * (docs/context/decisions/20261018-233051-mining-prices-from-the-open-prices-job.md;
 * replaces the retired `captureMiningPriceSnapshot` and its Firestore
 * `marketHistory` collection).
 *
 * Billing needs the station ("Jita 4-4 sell"): the job's `StationPriceFold`
 * (marketOpenPrices.ts, which since #4279 also feeds the Open Prices for every
 * type) keeps the highest buy and lowest sell among the orders *placed at*
 * each hub station, and this module keeps the mining types' days of it. A buy
 * order's `range` is not read: one placed elsewhere in the region never
 * counts as a station buy, the same as Fuzzwork's station aggregate the old
 * job read and `orderBook.ts`'s `filterOrdersByLocation`.
 *
 * R2 layout: one object per hub per month, `mining-prices/<hubId>/<YYYY-MM>.json`
 * (gzip), `{ hub, month, days: { <date>: { tier, prices: { <typeId>: [buy, sell] } } } }`,
 * because the readers ask for a date range of every mining type at one hub.
 * `tier` is the client's price-basis tier: 'saved' for station data (this
 * fold, and the old job's 'fuzzwork' days), 'historical' for the old
 * region-wide Adam4EVE backfill days the one-time migration carries over.
 *
 * Pure (no Firestore or fetch); the IO lives in r2MiningPrices.ts and index.ts.
 */
import {
  MARKET_OPEN_PRICES_MAX_DAYS,
  addDays,
  isIsoDate,
  type PricePair,
  type SnapshotHub,
  type StationPriceFold,
} from './marketOpenPrices.js';

// The station fold and the hub list live with the open prices since #4279
// (every type is folded per station now); re-exported for the mining callers.
export { SNAPSHOT_HUBS, StationPriceFold, type PricePair } from './marketOpenPrices.js';

export type MiningHub = SnapshotHub;

export const MINING_PRICES_R2_PREFIX = 'mining-prices/';
/**
 * Written once the old Firestore `marketHistory` days have been copied into
 * R2, so the copy runs exactly once (on the first run that finds it missing).
 */
export const MINING_PRICES_MIGRATED_KEY = `${MINING_PRICES_R2_PREFIX}migrated.json`;
/** Days kept, counting the published one: the open prices' window. */
export const MINING_PRICES_MAX_DAYS = MARKET_OPEN_PRICES_MAX_DAYS;

export type MiningTier = 'saved' | 'historical';
export interface MiningDay {
  tier: MiningTier;
  prices: Record<string, PricePair>;
}

export interface MiningPricesMonth {
  hub: string;
  month: string;
  days: Record<string, MiningDay>;
}

export interface MiningDayWrite {
  hubId: string;
  date: string;
  day: MiningDay;
}

export interface MiningMonthGroup {
  key: string;
  hubId: string;
  month: string;
  days: Record<string, MiningDay>;
}

export function miningPricesR2Key(hubId: string, month: string): string {
  return `${MINING_PRICES_R2_PREFIX}${hubId}/${month}.json`;
}

/**
 * The fold's day for each hub; a hub with no priced mining type at all is
 * left out rather than stored empty. `typeIds` keeps only those types: the
 * daily job's fold holds every type (the Open Prices), the mining objects
 * only the mining ones.
 */
export function stationFoldWrites(
  fold: StationPriceFold,
  hubs: readonly MiningHub[],
  date: string,
  typeIds?: Iterable<number>
): MiningDayWrite[] {
  const only = typeIds ? new Set(typeIds) : undefined;
  const writes: MiningDayWrite[] = [];
  for (const hub of hubs) {
    const prices = fold.prices(hub.stationId, only);
    if (Object.keys(prices).length === 0) continue;
    writes.push({ hubId: hub.id, date, day: { tier: 'saved', prices } });
  }
  return writes;
}

function nullablePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The old `marketHistory/{date}` docs (`{ hubs: { <stationId>: { <typeId>:
 * { buy, sell, … } } }, source }`) as day writes: 'fuzzwork' (the old job's
 * station capture) keeps the `saved` tier, 'adam4eve' (its region-wide Jita
 * backfill) keeps `historical`. Anything not shaped like one is skipped.
 */
export function marketHistoryWrites(
  docs: readonly { date: string; data: unknown }[],
  hubs: readonly MiningHub[]
): MiningDayWrite[] {
  const writes: MiningDayWrite[] = [];
  for (const { date, data } of docs) {
    if (!isIsoDate(date) || typeof data !== 'object' || data === null) continue;
    const { source, hubs: stored } = data as Record<string, unknown>;
    const tier: MiningTier | null =
      source === 'fuzzwork' ? 'saved' : source === 'adam4eve' ? 'historical' : null;
    if (!tier || typeof stored !== 'object' || stored === null) continue;
    for (const hub of hubs) {
      const station = (stored as Record<string, unknown>)[String(hub.stationId)];
      if (typeof station !== 'object' || station === null) continue;
      const prices: Record<string, PricePair> = {};
      for (const [typeId, value] of Object.entries(station)) {
        if (typeof value !== 'object' || value === null) continue;
        const { buy, sell } = value as Record<string, unknown>;
        const pair: PricePair = [nullablePrice(buy), nullablePrice(sell)];
        if (pair[0] !== null || pair[1] !== null) prices[typeId] = pair;
      }
      if (Object.keys(prices).length > 0)
        writes.push({ hubId: hub.id, date, day: { tier, prices } });
    }
  }
  return writes;
}

/** Groups day writes into their month objects; a later write of the same hub and date wins. */
export function groupByMonthObject(writes: Iterable<MiningDayWrite>): MiningMonthGroup[] {
  const groups = new Map<string, MiningMonthGroup>();
  for (const { hubId, date, day } of writes) {
    const month = date.slice(0, 7);
    const key = miningPricesR2Key(hubId, month);
    let group = groups.get(key);
    if (!group) {
      group = { key, hubId, month, days: {} };
      groups.set(key, group);
    }
    group.days[date] = day;
  }
  return [...groups.values()];
}

function isPricePair(value: unknown): value is PricePair {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => v === null || typeof v === 'number')
  );
}

function isMiningDay(value: unknown): value is MiningDay {
  if (typeof value !== 'object' || value === null) return false;
  const { tier, prices } = value as Record<string, unknown>;
  if (tier !== 'saved' && tier !== 'historical') return false;
  return typeof prices === 'object' && prices !== null && Object.values(prices).every(isPricePair);
}

/**
 * Merges `days` into the stored month object (`existing`, null when missing).
 * Idempotent: a date already stored is replaced whole. Days before `keepFrom`
 * and malformed stored days drop; the result's days are in date order.
 */
export function mergeMiningMonth(
  base: { hubId: string; month: string },
  existing: unknown,
  days: Readonly<Record<string, MiningDay>>,
  keepFrom: string
): MiningPricesMonth {
  const storedDays =
    typeof existing === 'object' && existing !== null
      ? (existing as Record<string, unknown>).days
      : null;
  const merged: Record<string, MiningDay> = {};
  if (typeof storedDays === 'object' && storedDays !== null) {
    for (const [date, day] of Object.entries(storedDays)) {
      if (isIsoDate(date) && isMiningDay(day)) merged[date] = day;
    }
  }
  Object.assign(merged, days);
  const sorted: Record<string, MiningDay> = {};
  for (const date of Object.keys(merged).sort()) {
    if (date >= keepFrom) sorted[date] = merged[date];
  }
  return { hub: base.hubId, month: base.month, days: sorted };
}

/** The first date kept when `date` is published. */
export function keepMiningDaysFrom(date: string): string {
  return addDays(date, -(MINING_PRICES_MAX_DAYS - 1));
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * The month objects wholly older than the retention window, to delete. Two
 * months back, not one, so a run skipped across a month boundary still
 * removes its month; deleting a missing key is a no-op.
 */
export function expiredMiningMonthKeys(date: string, hubs: readonly MiningHub[]): string[] {
  const first = previousMonth(keepMiningDaysFrom(date).slice(0, 7));
  const second = previousMonth(first);
  return hubs.flatMap((hub) => [
    miningPricesR2Key(hub.id, first),
    miningPricesR2Key(hub.id, second),
  ]);
}
