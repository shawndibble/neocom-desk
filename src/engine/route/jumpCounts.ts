/**
 * Jump counts for a whole table of routes at once (issue #943) — what a
 * courier board needs to rank hauls by distance.
 *
 * The naive shape is one pathfind per row, and it is the one to avoid: a
 * board holds hundreds of hauls and re-ranks on every preference change.
 * Neither is a full sweep per row the answer, though — courier origins are
 * only partly clustered on trade hubs, and a sweep to exhaustion costs more
 * than a single early-exiting lookup. So this groups by origin and picks per
 * group: one sweep where an origin is asked about several destinations, one
 * early-exiting lookup where it is asked about one.
 *
 * Pure, per CLAUDE.md. The caller supplies the graph; `features/route` is
 * what reads it off the snapshot.
 */
import {
  findJumpRoute,
  jumpDistancesFrom,
  type FindJumpRouteOptions,
  type JumpGraph,
} from './jumpRoute';

/**
 * One row's two ends. Either may be `null` — a haul into a player structure
 * has no system this app can place, and that is a haul with no measurable
 * distance rather than a short one.
 */
export interface RouteEnds {
  originSystemId: number | null;
  destinationSystemId: number | null;
}

/** Above this many destinations, one sweep beats that many single lookups. */
const SWEEP_THRESHOLD = 2;

/**
 * Jumps for each route, in the order asked, `null` where there is no distance
 * to give — an unplaced end, or two ends no stargate connects. Both read the
 * same way on a board ("unavailable"), and neither is zero.
 */
export function jumpCountsForRoutes(
  graph: JumpGraph,
  routes: readonly RouteEnds[],
  options: FindJumpRouteOptions = {}
): (number | null)[] {
  const byOrigin = new Map<number, number[]>();
  routes.forEach((route, index) => {
    if (route.originSystemId === null || route.destinationSystemId === null) return;
    const group = byOrigin.get(route.originSystemId);
    if (group) group.push(index);
    else byOrigin.set(route.originSystemId, [index]);
  });

  const counts = new Array<number | null>(routes.length).fill(null);
  for (const [originSystemId, indexes] of byOrigin) {
    if (indexes.length >= SWEEP_THRESHOLD) {
      const distances = jumpDistancesFrom(graph, originSystemId, options);
      for (const index of indexes) {
        counts[index] = distances.get(routes[index].destinationSystemId as number) ?? null;
      }
      continue;
    }
    const [index] = indexes;
    const route = findJumpRoute(
      graph,
      originSystemId,
      routes[index].destinationSystemId as number,
      options
    );
    counts[index] = route.kind === 'route' ? route.systems.length - 1 : null;
  }
  return counts;
}
