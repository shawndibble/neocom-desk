/**
 * ESI's `/route/` under the pilot's Travel Settings, with Avoided Systems
 * given the meaning the local graph gives them (`engine/route/jumpRoute.ts`):
 * a cost, never a wall.
 *
 * ESI's own avoid list is a hard filter — verified live, it answers 404 "No
 * route found" when the only way runs through an avoided system, and 422 past
 * its 1000-system cap. So the two ends are left out of the list, and either
 * answer is asked again without it: the trip still exists, it just crosses
 * systems the pilot would rather not. That retry drops the whole list, where
 * the local graph would still cross as few as it can — the two can differ
 * only for a trip with no clean way through.
 */
import { postRoute } from '@/esi/endpoints';
import type { EsiResult } from '@/esi/client';
import { EsiError } from '@/esi/errors';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { avoidListKey } from '@/engine/route/avoidRules';
import type { RouteRules } from './routeRules';

/** The one place the app's preference names meet ESI's. */
export function esiRoutePreference(
  preference: RoutePreferenceKind
): 'Shorter' | 'Safer' | 'LessSecure' {
  if (preference === 'prefer-highsec') return 'Safer';
  if (preference === 'avoid-highsec') return 'LessSecure';
  return 'Shorter';
}

/** The list ESI is actually sent for this pair: without either end, deduped and sorted. */
function avoidFor(
  originSystemId: number,
  destinationSystemId: number,
  avoid: readonly number[]
): number[] {
  return [...new Set(avoid)]
    .filter((id) => id !== originSystemId && id !== destinationSystemId)
    .sort((a, b) => a - b);
}

/**
 * The part of a pair's cache key the rules decide: distinct for every set of
 * rules that could route differently. Shorter ignores the penalty, so it is
 * left out there rather than splitting one answer across 101 keys.
 *
 * The avoid list goes in as its size and a hash, not its ids: with EDENCOM on
 * it runs past 137, and every route row would carry them all. `esi/cachePrune.ts`
 * matches this shape — keep the two in step.
 */
export function rulesCacheKey(
  originSystemId: number,
  destinationSystemId: number,
  rules: RouteRules
): string {
  const penalty = rules.preference === 'shortest' ? '' : `:p${rules.securityPenalty}`;
  const avoid = avoidFor(originSystemId, destinationSystemId, rules.avoid);
  const avoidKey = avoidListKey(avoid);
  return `${rules.preference}${penalty}${avoidKey ? `:${avoidKey}` : ''}`;
}

/**
 * The answers that mean "not with this avoid list" rather than "not at all":
 * 404 "No route found" when every way runs through one, and 422 when the list
 * is past ESI's 1000-system cap (both verified live).
 */
const AVOID_REFUSED = new Set([404, 422]);

export async function getRouteUnderRules(
  originSystemId: number,
  destinationSystemId: number,
  rules: RouteRules,
  options: { etag?: string } = {}
): Promise<EsiResult<number[]>> {
  const base = {
    ...options,
    preference: esiRoutePreference(rules.preference),
    securityPenalty: rules.preference === 'shortest' ? undefined : rules.securityPenalty,
  };
  const avoid = avoidFor(originSystemId, destinationSystemId, rules.avoid);
  if (avoid.length === 0) return postRoute(originSystemId, destinationSystemId, base);
  try {
    return await postRoute(originSystemId, destinationSystemId, { ...base, avoid });
  } catch (error) {
    if (!(error instanceof EsiError) || !AVOID_REFUSED.has(error.status)) throw error;
    return postRoute(originSystemId, destinationSystemId, base);
  }
}
