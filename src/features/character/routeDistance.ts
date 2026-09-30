/**
 * Jumps-away distance between two solar systems (issue #87), via ESI's
 * server-side `/route/` — no local pathfinding graph needed (CONTEXT.md round
 * 14). Cached under the global sentinel: a route between two systems under
 * given Travel rules is character-independent, same shape as `stations.ts`'s
 * station-name cache.
 */
import {
  conditionalFetch,
  loadWithCache,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
} from '@/esi/cache';
import { jumpsAwayFromRoute, type JumpsAwayResult } from '@/engine/jumpsAway';
import { getRouteUnderRules, rulesCacheKey, type EsiRouteRules } from '@/features/route/esiRoute';

function cacheKey(
  originSystemId: number,
  destinationSystemId: number,
  rules: EsiRouteRules
): string {
  return `route:${originSystemId}:${destinationSystemId}:${rulesCacheKey(originSystemId, destinationSystemId, rules)}`;
}

export async function loadJumpsAway(
  originSystemId: number,
  destinationSystemId: number,
  rules: EsiRouteRules
): Promise<JumpsAwayResult> {
  if (originSystemId === destinationSystemId) return jumpsAwayFromRoute([originSystemId]);
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getRouteUnderRules(originSystemId, destinationSystemId, rules, options)
  );
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(originSystemId, destinationSystemId, rules),
    fetchLive,
    // The jump graph is map data; a route between two fixed systems under
    // fixed rules is stable across a session and well beyond it. Pod-kill
    // avoidance changes the rules hourly, and so the key, not this entry.
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
  return jumpsAwayFromRoute(result?.data ?? null);
}
