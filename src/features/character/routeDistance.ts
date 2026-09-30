/**
 * Jumps-away distance between two solar systems (issue #87), via ESI's
 * server-side `/route/` — no local pathfinding graph needed (CONTEXT.md round
 * 14). Cached under the global sentinel: a route between two systems for a
 * given preference is character-independent, same shape as `stations.ts`'s
 * station-name cache.
 */
import { avoidCacheSuffix, getRouteAvoiding } from '@/features/route/esiRoute';
import {
  conditionalFetch,
  loadWithCache,
  GLOBAL_CACHE_CHARACTER_ID,
  STALE_AFTER,
} from '@/esi/cache';
import { jumpsAwayFromRoute, type JumpsAwayResult } from '@/engine/jumpsAway';
import type { RoutePreference } from './routePreference';

function cacheKey(
  originSystemId: number,
  destinationSystemId: number,
  preference: RoutePreference,
  avoid: readonly number[]
): string {
  return `route:${originSystemId}:${destinationSystemId}:${preference}${avoidCacheSuffix(
    originSystemId,
    destinationSystemId,
    avoid
  )}`;
}

/** The app's "Shortest"/"Safest" wording maps to ESI's real `shortest`/`secure` flag values — see `RouteOptions` in `esi/endpoints.ts`. */
function routeFlagFor(preference: RoutePreference): 'shortest' | 'secure' {
  return preference === 'safest' ? 'secure' : 'shortest';
}

export async function loadJumpsAway(
  originSystemId: number,
  destinationSystemId: number,
  preference: RoutePreference,
  /** The pilot's Avoided Systems — see `features/route/esiRoute.ts` for how ESI is asked. */
  avoid: readonly number[] = []
): Promise<JumpsAwayResult> {
  if (originSystemId === destinationSystemId) return jumpsAwayFromRoute([originSystemId]);
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getRouteAvoiding(originSystemId, destinationSystemId, avoid, {
      ...options,
      flag: routeFlagFor(preference),
    })
  );
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey(originSystemId, destinationSystemId, preference, avoid),
    fetchLive,
    // The jump graph is map data; a route between two fixed systems under a
    // fixed preference is stable across a session and well beyond it.
    { staleAfterMs: STALE_AFTER.static, conditional }
  );
  return jumpsAwayFromRoute(result?.data ?? null);
}
