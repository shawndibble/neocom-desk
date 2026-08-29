/**
 * Fetch + cache layer shared by every Character view (wallet, assets, mail,
 * calendar, contracts, orders): try ESI, on success persist to the generic
 * `esiCache` Dexie table, on failure (offline, ESI down) fall back to
 * whatever is cached. Never throws for "no network" — callers get `null`
 * only when there is neither a live response nor a cached one.
 *
 * Mirrors src/features/skills/data.ts's read-through pattern (duplicated
 * rather than imported/exported, same as src/features/industry/data.ts
 * already does — that module is read-only territory for this feature).
 */
import { db } from '@/db';

export interface CachedResult<T> {
  data: T;
  fetchedAt: Date;
  fromCache: boolean;
}

/**
 * Public, character-independent lookups (station names, universe/names
 * results) share this sentinel row instead of one row per character. Must
 * match the constant of the same name in src/features/skills/data.ts.
 */
export const GLOBAL_CACHE_CHARACTER_ID = 0;

export async function loadWithCache<T>(
  characterId: number,
  key: string,
  fetchLive: () => Promise<T | null>
): Promise<CachedResult<T> | null> {
  try {
    const data = await fetchLive();
    if (data !== null) {
      const fetchedAt = Date.now();
      await db.esiCache.put({ characterId, key, value: data, fetchedAt });
      return { data, fetchedAt: new Date(fetchedAt), fromCache: false };
    }
  } catch {
    // Offline or ESI failure: fall back to whatever is cached below.
  }
  const cached = await db.esiCache.get([characterId, key]);
  if (!cached) return null;
  return { data: cached.value as T, fetchedAt: new Date(cached.fetchedAt), fromCache: true };
}
