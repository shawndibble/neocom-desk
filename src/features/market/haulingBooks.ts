/**
 * Reads a Trade Hub station's order books, published every 30 minutes by the
 * `public-data-hauling-books` GitHub Actions job (`hauling-books/<stationId>.json` in R2;
 * `functions/src/haulingBooks.ts`): every type's best buy and sell price levels at the
 * station, folded from EVE Ref's latest market-order snapshot. One cached request per
 * station replaces an ESI order-book request per item in the hauling scan's last pass.
 * `null` means unavailable or stale, and the scan falls back to ESI books for a short list.
 */
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';
import type { LadderLevel } from '@/engine/market/haulingMarket';
import { MINUTE_MS, HOUR_MS } from '@/lib/age';

/** The backend republishes every 30 minutes. */
const STALE_AFTER_MS = 10 * MINUTE_MS;
/** A snapshot older than this means the job stopped (it is normally under an hour old): ESI is the better source. */
export const MAX_BOOKS_AGE_MS = 3 * HOUR_MS;

export interface StationBooks {
  sell: LadderLevel[];
  buy: LadderLevel[];
}

export interface HaulingBooks {
  /** When EVE Ref published the snapshot the books were built from (ms). */
  asOf: number;
  lastSyncedAt: number;
  /** By type id; a type with no orders at the station is absent. */
  types: ReadonlyMap<number, StationBooks>;
}

function parseLevels(raw: unknown): LadderLevel[] | null {
  if (!Array.isArray(raw)) return null;
  const levels: LadderLevel[] = [];
  for (const tuple of raw) {
    if (!Array.isArray(tuple) || tuple.length < 3) return null;
    const [price, units, orders] = tuple as unknown[];
    if (typeof price !== 'number' || typeof units !== 'number' || typeof orders !== 'number') {
      return null;
    }
    levels.push({ price, units, orders });
  }
  return levels;
}

/** The object as `functions/src/haulingBooks.ts` writes it, or `null` when it is not that shape. */
export function parseHaulingBooks(raw: unknown): HaulingBooks | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { lastSyncedAt, asOf, types } = raw as Record<string, unknown>;
  if (typeof lastSyncedAt !== 'number' || !(lastSyncedAt > 0)) return null;
  if (typeof asOf !== 'number' || !(asOf > 0)) return null;
  if (typeof types !== 'object' || types === null || Array.isArray(types)) return null;
  const byType = new Map<number, StationBooks>();
  for (const [typeId, book] of Object.entries(types)) {
    const id = Number(typeId);
    if (!Number.isInteger(id) || !Array.isArray(book) || book.length < 2) continue;
    const sell = parseLevels(book[0]);
    const buy = parseLevels(book[1]);
    if (sell && buy) byType.set(id, { sell, buy });
  }
  return { asOf, lastSyncedAt, types: byType };
}

/** Jita's object is about 1.2 MB gzipped: more room than the 20 s the small R2 objects get, or a slow link silently drops to the capped ESI path. */
const READ_TIMEOUT_MS = MINUTE_MS;

async function fetchBooks(stationId: number): Promise<HaulingBooks | null> {
  try {
    const response = await fetch(`${R2_SNAPSHOT_ORIGIN}/hauling-books/${stationId}.json`, {
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn('[hauling-diag] books fetch not ok', stationId, response.status);
      return null;
    }
    const parsed = parseHaulingBooks(await response.json());
    if (!parsed) console.warn('[hauling-diag] books parse failed', stationId);
    return parsed;
  } catch (error) {
    console.warn('[hauling-diag] books fetch threw', stationId, error);
    return null;
  }
}

export async function loadHaulingBooks(stationId: number): Promise<HaulingBooks | null> {
  try {
    const cached = await loadWithCache(
      GLOBAL_CACHE_CHARACTER_ID,
      `haulingBooksR2:${stationId}`,
      () => fetchBooks(stationId),
      { staleAfterMs: STALE_AFTER_MS, allowStaleServe: true }
    );
    const books = cached?.data ?? null;
    const usable = books !== null && Date.now() - books.asOf <= MAX_BOOKS_AGE_MS;
    console.warn('[hauling-diag] books loaded', stationId, {
      cached: cached !== null,
      fromCache: cached?.fromCache,
      usable,
    });
    return usable ? books : null;
  } catch (error) {
    console.warn('[hauling-diag] loadHaulingBooks threw', stationId, error);
    return null;
  }
}
