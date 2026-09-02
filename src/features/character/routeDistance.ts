/**
 * Jumps-away distance between two solar systems (issue #87), via ESI's
 * server-side `/route/` — no local pathfinding graph needed (CONTEXT.md round
 * 14). Cached under the global sentinel: a route between two systems for a
 * given preference is character-independent, same shape as `stations.ts`'s
 * station-name cache.
 */
import { getRoute } from '@/esi/endpoints';
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER } from '@/esi/cache';
import { jumpsAwayFromRoute, type JumpsAwayResult } from '@/engine/jumpsAway';
import type { RoutePreference } from './routePreference';

function cacheKey(
  originSystemId: number,
  destinationSystemId: number,
  preference: RoutePreference
): string {
  return `route:${originSystemId}:${destinationSystemId}:${preference}`;
}

/** The app's "Shortest"/"Safest" wording maps to ESI's real `shortest`/`secure` flag values — see `RouteOptions` in `esi/endpoints.ts`. */
function routeFlagFor(preference: RoutePreference): 'shortest' | 'secure' {
  return preference === 'safest' ? 'secure' : 'shortest';
}

export async function loadJumpsAway(
  originSystemId: number,
  destinationSystemId: number,
  preference: RoutePreference
): Promise<JumpsAwayResult> {
  if (originSystemId === destinationSystemId) return jumpsAwayFromRoute([originSystemId]);
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(originSystemId, destinationSystemId, preference),
    async () =>
      (await getRoute(originSystemId, destinationSystemId, { flag: routeFlagFor(preference) }))
        .data,
    // The jump graph is map data; a route between two fixed systems under a
    // fixed preference is stable across a session and well beyond it.
    { staleAfterMs: STALE_AFTER.static }
  );
  return jumpsAwayFromRoute(result?.data ?? null);
}
