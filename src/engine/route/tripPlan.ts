import {
  routeSweepFrom,
  type FindJumpRouteOptions,
  type JumpGraph,
  type JumpRouteResult,
  type RouteSweep,
} from './jumpRoute';

export const MAX_STOPS = 10;

export interface RouteCost {
  cost: number;
  jumps: number;
}

export type RouteCostMatrix = readonly (readonly (RouteCost | null)[])[];

export interface StopOrderOptions {
  returnToStart?: boolean;
  keepLastStopLast?: boolean;
}

export interface TripOptions extends StopOrderOptions {
  optimize?: boolean;
}

export interface TripLeg {
  from: number;
  to: number;
  route: JumpRouteResult;
}

export interface TripPlan {
  legs: TripLeg[];
  reordered: { stops: number[]; typedJumps: number; jumps: number } | null;
  unreachable: boolean;
}

const TIE = 1e-2;

function sweepPoints(
  graph: JumpGraph,
  points: readonly number[],
  options: FindJumpRouteOptions
): { sweeps: RouteSweep[]; matrix: RouteCostMatrix } {
  const sweeps = points.map((from) => routeSweepFrom(graph, from, options));
  const matrix = sweeps.map((sweep) => points.map((to) => costTo(sweep, graph, to)));
  return { sweeps, matrix };
}

function costTo(sweep: RouteSweep, graph: JumpGraph, to: number): RouteCost | null {
  const cost = sweep.costs.get(to);
  const jumps = sweep.jumps.get(to);
  if (!graph.has(to) || cost === undefined || jumps === undefined) return null;
  return { cost, jumps };
}

function orderTotal(
  matrix: RouteCostMatrix,
  order: readonly number[],
  returnToStart: boolean
): RouteCost | null {
  const path = [0, ...order, ...(returnToStart ? [0] : [])];
  let cost = 0;
  let jumps = 0;
  for (let index = 1; index < path.length; index += 1) {
    const leg = matrix[path[index - 1]][path[index]];
    if (!leg) return null;
    cost += leg.cost;
    jumps += leg.jumps;
  }
  return { cost, jumps };
}

export function optimizeStopOrder(
  matrix: RouteCostMatrix,
  options: StopOrderOptions = {}
): number[] | null {
  const { returnToStart = false, keepLastStopLast = false } = options;
  const n = matrix.length - 1;
  if (matrix.some((row) => row.some((cell) => cell === null))) return null;
  const typed = Array.from({ length: n }, (_, index) => index + 1);
  if (n <= 1) return typed;

  const cost = (from: number, to: number) => matrix[from][to]?.cost ?? Number.POSITIVE_INFINITY;
  const last = keepLastStopLast ? n : null;
  const free = last === null ? typed : typed.slice(0, -1);
  const tail = (stop: number) => {
    const end = last ?? stop;
    return (last === null ? 0 : cost(stop, last)) + (returnToStart ? cost(end, 0) : 0);
  };

  const size = 1 << free.length;
  const best = Array.from({ length: size }, () =>
    new Array<number>(free.length).fill(Number.POSITIVE_INFINITY)
  );
  const parent = Array.from({ length: size }, () => new Array<number>(free.length).fill(-1));
  free.forEach((stop, index) => {
    best[1 << index][index] = cost(0, stop);
  });
  for (let mask = 1; mask < size; mask += 1) {
    for (let end = 0; end < free.length; end += 1) {
      const here = best[mask][end];
      if (!(mask & (1 << end)) || here === Number.POSITIVE_INFINITY) continue;
      for (let next = 0; next < free.length; next += 1) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const total = here + cost(free[end], free[next]);
        if (total < best[nextMask][next]) {
          best[nextMask][next] = total;
          parent[nextMask][next] = end;
        }
      }
    }
  }

  const full = size - 1;
  let bestEnd = 0;
  let bestTotal = Number.POSITIVE_INFINITY;
  free.forEach((stop, index) => {
    const total = best[full][index] + tail(stop);
    if (total < bestTotal) {
      bestTotal = total;
      bestEnd = index;
    }
  });

  const typedTotal = orderTotal(matrix, typed, returnToStart)?.cost ?? Number.POSITIVE_INFINITY;
  if (typedTotal - bestTotal <= TIE) return typed;

  const order: number[] = [];
  for (let mask = full, end = bestEnd; end !== -1;) {
    order.unshift(free[end]);
    const previous = parent[mask][end];
    mask &= ~(1 << end);
    end = previous;
  }
  return last === null ? order : [...order, last];
}

export function planTrip(
  graph: JumpGraph,
  start: number,
  stops: readonly number[],
  routeOptions: FindJumpRouteOptions = {},
  tripOptions: TripOptions = {}
): TripPlan {
  const { optimize = false, returnToStart = false, keepLastStopLast = false } = tripOptions;
  const points = [start, ...stops];
  const { sweeps, matrix } = sweepPoints(graph, points, routeOptions);
  const unreachable = matrix.some((row) => row.some((cell) => cell === null));

  const typed = stops.map((_, index) => index + 1);
  const order =
    optimize && !unreachable
      ? (optimizeStopOrder(matrix, { returnToStart, keepLastStopLast }) ?? typed)
      : typed;
  const path = [0, ...order, ...(returnToStart ? [0] : [])];
  const legs = path.slice(1).map((to, index): TripLeg => {
    const from = path[index];
    const systems = sweeps[from].routeTo(points[to]);
    return {
      from: points[from],
      to: points[to],
      route: systems === null ? { kind: 'no-route' } : { kind: 'route', systems },
    };
  });

  const changed = order.some((point, index) => point !== typed[index]);
  const typedTotal = orderTotal(matrix, typed, returnToStart);
  const total = orderTotal(matrix, order, returnToStart);
  return {
    legs,
    reordered:
      changed && typedTotal && total
        ? {
            stops: order.map((point) => points[point]),
            typedJumps: typedTotal.jumps,
            jumps: total.jumps,
          }
        : null,
    unreachable,
  };
}
