/**
 * Reads the server's daily hub-station mining prices (docs/context/decisions/
 * 20261018-233051-mining-prices-from-the-open-prices-job.md): the
 * `syncMarketOpenPrices` Cloud Function folds each UTC day's end-of-day EVE Ref
 * order snapshot into the best buy and sell of every mining type at each hub
 * station and publishes one static object per hub per month to Cloudflare R2
 * (`mining-prices/<hubId>/<YYYY-MM>.json`, `functions/src/miningHubPrices.ts`).
 * Public data on a plain URL, like the open prices (`marketOpenPrices.ts`), so
 * this needs no Firebase session.
 *
 * A day's `tier` is the price-basis tier it feeds (`priceBasis.ts`): 'saved'
 * is station data (merged with the per-browser Dexie snapshot for Jita —
 * `priceSnapshots.ts` has no equivalent for the other 4 hubs); 'historical'
 * is the retired job's region-wide Adam4EVE backfill, copied over once and
 * Jita-only, so a non-Jita hub's `historical` map is always empty.
 *
 * Never fails a caller: a month with no object (404), a failed read and a
 * malformed object all count as no days, and the tier chain falls further
 * back. Only a good answer (including "no such object") is held, per URL, for
 * the publish interval; a failure is retried the next time.
 */
import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';
import { DEFAULT_TRADE_HUB, type TradeHub } from '@/market/hubs';
import type { SidePrices } from '@/engine/miningTax/priceBasis';

export type MiningPriceTier = 'saved' | 'historical';

export interface HubSnapshotRange {
  /** Station prices the server folded for a day, by date then type id. */
  saved: Map<string, Map<number, SidePrices>>;
  /** The retired job's region-wide Adam4EVE days (Jita only), by date then type id. */
  historical: Map<string, Map<number, SidePrices>>;
}

/** Mirrors `miningPricesR2Key` on the Functions side (`functions/src/miningHubPrices.ts`). */
export function miningPricesUrl(hub: TradeHub, month: string): string {
  return `${R2_SNAPSHOT_ORIGIN}/mining-prices/${hub.id}/${month}.json`;
}

const READ_TIMEOUT_MS = 20_000;
/** The backend publishes once a day. */
const CACHE_TTL_MS = 60 * 60_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type MonthDays = Map<string, { tier: MiningPriceTier; prices: Map<number, SidePrices> }>;

const cache = new Map<string, { at: number; days: MonthDays }>();
const inflight = new Map<string, Promise<MonthDays | null>>();

/** Test seam: forget held months. */
export function resetHubSnapshotCache(): void {
  cache.clear();
  inflight.clear();
}

function sidePrice(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

/**
 * A stored month object (`{ days: { <date>: { tier, prices: { <typeId>: [buy, sell] } } } }`)
 * by date; a malformed day or price is skipped, anything else reads as no days.
 */
export function parseMiningPricesMonth(data: unknown): MonthDays {
  const out: MonthDays = new Map();
  if (typeof data !== 'object' || data === null) return out;
  const { days } = data as Record<string, unknown>;
  if (typeof days !== 'object' || days === null) return out;
  for (const [date, day] of Object.entries(days)) {
    if (!ISO_DATE.test(date) || typeof day !== 'object' || day === null) continue;
    const { tier, prices } = day as Record<string, unknown>;
    if ((tier !== 'saved' && tier !== 'historical') || typeof prices !== 'object' || !prices) {
      continue;
    }
    const byType = new Map<number, SidePrices>();
    for (const [id, pair] of Object.entries(prices)) {
      const typeId = Number(id);
      if (!Number.isInteger(typeId) || !Array.isArray(pair) || pair.length !== 2) continue;
      const [buy, sell] = pair as unknown[];
      if (sidePrice(buy) && sidePrice(sell)) byType.set(typeId, { buy, sell });
    }
    out.set(date, { tier, prices: byType });
  }
  return out;
}

/** The month's days, or null when the read failed (not held, so it is retried). */
async function loadMonth(url: string): Promise<MonthDays | null> {
  const held = cache.get(url);
  if (held && Date.now() - held.at < CACHE_TTL_MS) return held.days;
  const pending = inflight.get(url);
  if (pending) return pending;
  const read = (async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
      if (response.status !== 404 && !response.ok) return null;
      const days =
        response.status === 404 ? new Map() : parseMiningPricesMonth(await response.json());
      cache.set(url, { at: Date.now(), days });
      return days;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, read);
  return read;
}

function monthsBetween(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  let [year, month] = startDate.slice(0, 7).split('-').map(Number);
  const last = endDate.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    months.push(key);
    if (key >= last) return months;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

/**
 * Every published day in `[startDate, endDate]` (inclusive) at `hub`, split
 * by tier. Reads one object per month the range touches, in parallel.
 */
export async function loadHubSnapshotRange(
  startDate: string,
  endDate: string,
  hub: TradeHub = DEFAULT_TRADE_HUB
): Promise<HubSnapshotRange> {
  const result: HubSnapshotRange = { saved: new Map(), historical: new Map() };
  if (startDate > endDate) return result;
  const months = await Promise.all(
    monthsBetween(startDate, endDate).map((month) => loadMonth(miningPricesUrl(hub, month)))
  );
  for (const days of months) {
    for (const [date, { tier, prices }] of days ?? []) {
      if (date >= startDate && date <= endDate) result[tier].set(date, prices);
    }
  }
  return result;
}
