import {
  conditionalFetch,
  GLOBAL_CACHE_CHARACTER_ID,
  loadWithCache,
  STALE_AFTER,
} from '@/esi/cache';
import { getUniverseFactions, type UniverseFaction } from '@/esi/endpoints';

const CACHE_KEY = 'universe-factions';

/**
 * Every NPC faction (description, capital, size, station counts), cached like
 * the other static universe data. `null` when ESI did not answer and nothing is
 * cached: an unread list is not "no factions".
 */
export async function loadFactions(): Promise<UniverseFaction[] | null> {
  const { fetchLive, conditional } = conditionalFetch((options) => getUniverseFactions(options));
  const result = await loadWithCache(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY, fetchLive, {
    staleAfterMs: STALE_AFTER.static,
    conditional,
  }).catch(() => null);
  return result?.data ?? null;
}
