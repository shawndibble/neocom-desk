/**
 * Daily open buy and sell prices for one item: the read half of the
 * `syncMarketOpenPrices` Cloud Function (docs/context/decisions/
 * 20261018-121126-price-history-draws-daily-open-buy-and-sell.md; layout:
 * 20261018-164126-open-prices-one-document-per-type-every-hub.md). One object per
 * type holding every Trade Hub station, a static file in Cloudflare R2 (20261018-201511-moving-the-daily-snapshots-to-r2.md), so — like the contract snapshots — this
 * needs no Firebase session and the read costs no egress.
 *
 * The prices are the hub *station*'s (Jita 4-4), keyed by station id.
 *
 * Never fails the history panel: a missing object (a type the daily job has
 * not reached), a region the object does not hold (any non-hub region) and an
 * offline client all come back as `null`, and the chart falls back to ESI's
 * average line. Only a good answer (including "no such object") is held, per
 * type, so the panel's primary and compared regions share one read and
 * reopening it costs none; a failure is retried the next time.
 */
import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';
import type { OpenPriceSeries } from '@/engine/market/priceHistoryOpen';
import { TRADE_HUBS } from '@/market/hubs';
import { isRecord } from '@/engine/guards';
import { HOUR_MS } from '@/lib/age';

/** Mirrors `openPricesR2Key` on the Functions side (`functions/src/r2DailySnapshots.ts`). */
export function openPricesUrl(typeId: number): string {
  return `${R2_SNAPSHOT_ORIGIN}/open-prices/${typeId}.json`;
}

const READ_TIMEOUT_MS = 20_000;

/** The type's object, or `null` when R2 has none (404); any other failure throws. */
async function fetchTypeObject(typeId: number): Promise<unknown | null> {
  const response = await fetch(openPricesUrl(typeId), {
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`open prices ${typeId}: ${response.status}`);
  return response.json();
}

/** The backend publishes once a day. */
const CACHE_TTL_MS = HOUR_MS;

/** A type's object as series, by hub station id. */
export interface StoredOpenPrices {
  stations: ReadonlyMap<number, OpenPriceSeries>;
}

/** What a region draws: its hub station's series. */
export interface HubOpenPrices {
  series: OpenPriceSeries;
  stationId: number;
}

function isNumberOrNullArray(value: unknown): value is (number | null)[] {
  return Array.isArray(value) && value.every((v) => v === null || typeof v === 'number');
}

function seriesById(map: unknown, dates: string[]): Map<number, OpenPriceSeries> {
  const out = new Map<number, OpenPriceSeries>();
  if (!isRecord(map)) return out;
  for (const [key, series] of Object.entries(map)) {
    const id = Number(key);
    if (!Number.isInteger(id) || !isRecord(series)) continue;
    const { buy, sell } = series;
    if (!isNumberOrNullArray(buy) || !isNumberOrNullArray(sell)) continue;
    out.set(id, { dates, buy, sell });
  }
  return out;
}

/**
 * The stored type object as series, or null when it is not shaped like one.
 * Mirrors the writer's layout: a shared ascending `dates` array and
 * `stations.<stationId>.buy|sell` parallel to it. A malformed series is skipped.
 */
export function parseOpenPricesByType(data: unknown): StoredOpenPrices | null {
  if (!isRecord(data)) return null;
  const { dates, stations } = data;
  if (!Array.isArray(dates) || !dates.every((d) => typeof d === 'string')) return null;
  if (dates.length === 0 || !isRecord(stations)) return null;
  return { stations: seriesById(stations, dates) };
}

/** The region's series to draw out of a type's object, or null when it has none (any non-hub region). */
export function pickOpenPrices(stored: StoredOpenPrices, regionId: number): HubOpenPrices | null {
  const stationId = TRADE_HUBS.find((hub) => hub.regionId === regionId)?.stationId;
  const series = stationId === undefined ? undefined : stored.stations.get(stationId);
  return series && stationId !== undefined ? { series, stationId } : null;
}

const cache = new Map<number, { at: number; stored: StoredOpenPrices | null }>();
/** One read per type even when several regions ask at once; resolves undefined on failure. */
const inflight = new Map<number, Promise<StoredOpenPrices | null | undefined>>();

/** For tests: forget every cached document. */
export function resetMarketOpenPricesCache(): void {
  cache.clear();
  inflight.clear();
}

function readType(typeId: number, now: number): Promise<StoredOpenPrices | null | undefined> {
  let pending = inflight.get(typeId);
  if (!pending) {
    // Started inside the chain, so a synchronous failure is a failed read too,
    // never a rejection.
    const read: Promise<StoredOpenPrices | null | undefined> = Promise.resolve()
      .then(() => fetchTypeObject(typeId))
      .then((body) => {
        const stored = body === null ? null : parseOpenPricesByType(body);
        cache.set(typeId, { at: now, stored });
        return stored;
      })
      .catch(() => undefined)
      .finally(() => {
        if (inflight.get(typeId) === read) inflight.delete(typeId);
      });
    pending = read;
    inflight.set(typeId, read);
  }
  return pending;
}

/** The item's open-price series for the region (its hub station's), or null for "none to draw". Never throws. */
export async function loadMarketOpenPrices(
  regionId: number,
  typeId: number,
  now: number = Date.now()
): Promise<HubOpenPrices | null> {
  const stored = await loadStoredOpenPrices(typeId, now);
  return stored ? pickOpenPrices(stored, regionId) : null;
}

/**
 * The type's whole stored object, or null when there is none or the read
 * failed. Never throws. The mining prices (`hubSnapshot.ts`) read it this way;
 * shares the cache with `loadMarketOpenPrices`.
 */
export async function loadStoredOpenPrices(
  typeId: number,
  now: number = Date.now()
): Promise<StoredOpenPrices | null> {
  const hit = cache.get(typeId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.stored;
  return (await readType(typeId, now)) ?? null;
}
