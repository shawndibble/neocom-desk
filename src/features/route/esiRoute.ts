/**
 * ESI's `/route/` under the pilot's Travel settings, with Avoided Systems
 * given the meaning the local graph gives them (`engine/route/jumpRoute.ts`):
 * a cost, never a wall.
 *
 * ESI's own avoid list is a hard filter — verified live, it answers 404 "No
 * route found" when the only way runs through an avoided system. So the two
 * ends are left out of the list, and a 404 under a non-empty list is asked
 * again without it: the trip still exists, it just has to cross a system the
 * pilot would rather not.
 */
import { postRoute } from '@/esi/endpoints';
import type { EsiResult } from '@/esi/client';
import { EsiError } from '@/esi/errors';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';

/** What a route is asked under — the Travel settings, or a page's own preference over them. */
export interface EsiRouteRules {
  preference: RoutePreferenceKind;
  securityPenalty: number;
  avoid: readonly number[];
}

/** Shortest, nothing avoided — for a caller with no Travel settings to hand. */
export const PLAIN_ROUTE_RULES: EsiRouteRules = {
  preference: 'shortest',
  securityPenalty: 50,
  avoid: [],
};

/** The one place the app's preference names meet ESI's. */
export function esiRoutePreference(
  preference: RoutePreferenceKind
): 'Shorter' | 'Safer' | 'LessSecure' {
  if (preference === 'prefer-highsec') return 'Safer';
  if (preference === 'avoid-highsec') return 'LessSecure';
  return 'Shorter';
}

/** The list ESI is actually sent for this pair: without either end, deduped and sorted. */
export function avoidFor(
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
 */
export function rulesCacheKey(
  originSystemId: number,
  destinationSystemId: number,
  rules: EsiRouteRules
): string {
  const penalty = rules.preference === 'shortest' ? '' : `:p${rules.securityPenalty}`;
  const avoid = avoidFor(originSystemId, destinationSystemId, rules.avoid);
  return `${rules.preference}${penalty}${avoid.length ? `:avoid=${avoid.join(',')}` : ''}`;
}

export async function getRouteUnderRules(
  originSystemId: number,
  destinationSystemId: number,
  rules: EsiRouteRules,
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
    if (!(error instanceof EsiError) || error.status !== 404) throw error;
    return postRoute(originSystemId, destinationSystemId, base);
  }
}
