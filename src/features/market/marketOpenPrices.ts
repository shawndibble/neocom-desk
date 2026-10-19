/**
 * Daily open buy and sell prices for one item: the read half of the
 * `syncMarketOpenPrices` Cloud Function (docs/context/decisions/
 * 20261018-121126-price-history-draws-daily-open-buy-and-sell.md; layout:
 * 20261018-164126-open-prices-one-document-per-type-every-hub.md). One object per
 * type holding every Trade Hub region, a static file in Cloudflare R2 (20261018-201511-moving-the-daily-snapshots-to-r2.md), so — like the contract snapshots — this
 * needs no Firebase session and the read costs no egress.
 *
 * Never fails the history panel: a missing object (a type the backfill has
 * not reached), a region the object does not hold (any non-hub region) and an
 * offline client all come back as `null`, and the chart falls back to ESI's
 * average line. Only a good answer (including "no such object") is held, per
 * type, so the panel's primary and compared regions share one read and
 * reopening it costs none; a failure is retried the next time.
 */
import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';
import type { OpenPriceSeries } from '@/engine/market/priceHistoryOpen';

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
const CACHE_TTL_MS = 60 * 60_000;

type RegionSeries = ReadonlyMap<number, OpenPriceSeries>;

function isNumberOrNullArray(value: unknown): value is (number | null)[] {
  return Array.isArray(value) && value.every((v) => v === null || typeof v === 'number');
}

/**
 * The stored type document as one series per region, or null when it is not
 * shaped like one. Mirrors the writer's layout: a shared ascending `dates`
 * array and `regions.<regionId>.buy|sell` parallel to it. A malformed region
 * is skipped.
 */
export function parseOpenPricesByType(data: unknown): RegionSeries | null {
  if (typeof data !== 'object' || data === null) return null;
  const { dates, regions } = data as Record<string, unknown>;
  if (!Array.isArray(dates) || !dates.every((d) => typeof d === 'string')) return null;
  if (dates.length === 0 || typeof regions !== 'object' || regions === null) return null;
  const out = new Map<number, OpenPriceSeries>();
  for (const [id, series] of Object.entries(regions)) {
    const regionId = Number(id);
    if (!Number.isInteger(regionId) || typeof series !== 'object' || series === null) continue;
    const { buy, sell } = series as Record<string, unknown>;
    if (!isNumberOrNullArray(buy) || !isNumberOrNullArray(sell)) continue;
    out.set(regionId, { dates: dates as string[], buy, sell });
  }
  return out;
}

const cache = new Map<number, { at: number; regions: RegionSeries | null }>();
/** One read per type even when several regions ask at once; resolves undefined on failure. */
const inflight = new Map<number, Promise<RegionSeries | null | undefined>>();

/** For tests: forget every cached document. */
export function resetMarketOpenPricesCache(): void {
  cache.clear();
  inflight.clear();
}

function readType(typeId: number, now: number): Promise<RegionSeries | null | undefined> {
  let pending = inflight.get(typeId);
  if (!pending) {
    // Started inside the chain, so a synchronous failure is a failed read too,
    // never a rejection.
    const read: Promise<RegionSeries | null | undefined> = Promise.resolve()
      .then(() => fetchTypeObject(typeId))
      .then((body) => {
        const regions = body === null ? null : parseOpenPricesByType(body);
        cache.set(typeId, { at: now, regions });
        return regions;
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

/** The item's open-price series in the region, or null for "none to draw". Never throws. */
export async function loadMarketOpenPrices(
  regionId: number,
  typeId: number,
  now: number = Date.now()
): Promise<OpenPriceSeries | null> {
  const hit = cache.get(typeId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.regions?.get(regionId) ?? null;
  const regions = await readType(typeId, now);
  return regions?.get(regionId) ?? null;
}
