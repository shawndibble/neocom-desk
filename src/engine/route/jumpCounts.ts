import { findFlownRoute, flownJumpDistancesFrom } from './holeDetour';
import type { FindJumpRouteOptions, JumpGraph } from './jumpRoute';

export interface RouteEnds {
  originSystemId: number | null;
  destinationSystemId: number | null;
}

const SWEEP_THRESHOLD = 2;

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
      const distances = flownJumpDistancesFrom(graph, originSystemId, options);
      for (const index of indexes) {
        const destinationSystemId = routes[index].destinationSystemId as number;
        if (!graph.has(destinationSystemId)) continue;
        counts[index] = distances.get(destinationSystemId) ?? null;
      }
      continue;
    }
    const [index] = indexes;
    const route = findFlownRoute(
      graph,
      originSystemId,
      routes[index].destinationSystemId as number,
      options
    );
    counts[index] = route.kind === 'route' ? route.systems.length - 1 : null;
  }
  return counts;
}
