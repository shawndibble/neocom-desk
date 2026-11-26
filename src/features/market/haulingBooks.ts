import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { R2_SNAPSHOT_ORIGIN } from '@/features/contractSearch/r2OfferSnapshot';
import type { LadderLevel } from '@/engine/market/haulingMarket';
import { MINUTE_MS, HOUR_MS } from '@/lib/age';

const STALE_AFTER_MS = 10 * MINUTE_MS;
export const MAX_BOOKS_AGE_MS = 3 * HOUR_MS;

export interface StationBooks {
  sell: LadderLevel[];
  buy: LadderLevel[];
}

export interface HaulingBooks {
  asOf: number;
  lastSyncedAt: number;
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
