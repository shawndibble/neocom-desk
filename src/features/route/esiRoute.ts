/**
 * ESI's `/route/` with the pilot's Avoided Systems, given the meaning the
 * local graph gives them (`engine/route/jumpRoute.ts`): a cost, never a wall.
 *
 * ESI's own `avoid` is a hard filter — verified live, it answers 404 "No
 * route found" when the only way runs through an avoided system, and for an
 * avoided destination. So the two ends are left out of the list, and a 404
 * under a non-empty list is asked again without it: the trip still exists,
 * it just has to cross a system the pilot would rather not.
 */
import { getRoute, type RouteOptions } from '@/esi/endpoints';
import type { EsiResult } from '@/esi/client';
import { EsiError } from '@/esi/errors';

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
 * The cache-key suffix for a pair's avoid list — empty when nothing is
 * avoided, so a key cached before this setting existed stays valid, and
 * distinct for every list that could route differently.
 */
export function avoidCacheSuffix(
  originSystemId: number,
  destinationSystemId: number,
  avoid: readonly number[]
): string {
  const effective = avoidFor(originSystemId, destinationSystemId, avoid);
  return effective.length ? `:avoid=${effective.join(',')}` : '';
}

export async function getRouteAvoiding(
  originSystemId: number,
  destinationSystemId: number,
  avoid: readonly number[],
  options: Omit<RouteOptions, 'avoid'> = {}
): Promise<EsiResult<number[]>> {
  const effective = avoidFor(originSystemId, destinationSystemId, avoid);
  if (effective.length === 0) return getRoute(originSystemId, destinationSystemId, options);
  try {
    return await getRoute(originSystemId, destinationSystemId, { ...options, avoid: effective });
  } catch (error) {
    if (!(error instanceof EsiError) || error.status !== 404) throw error;
    return getRoute(originSystemId, destinationSystemId, options);
  }
}
