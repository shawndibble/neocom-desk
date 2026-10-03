/**
 * A trip through several Stops (issue #2475): the Legs flown between them, and
 * — when asked — the stop order with the lowest total route cost.
 *
 * Every cost here comes from the same search, under the same options, that
 * draws a leg (`routeSweepFrom`), so an optimized order and the legs it is
 * flown with always agree: under Prefer shorter that is the fewest jumps, and
 * under a security preference it is the preference's own cost, not raw jumps.
 * Anything the leg search learns — Avoided Systems today, wormhole edges in
 * the graph later — reaches the ordering with no change here.
 */
import {
  routeSweepFrom,
  type FindJumpRouteOptions,
  type JumpGraph,
  type JumpRouteResult,
} from './jumpRoute';

/** The most stops a trip takes after its start: Held-Karp stays instant to here. */
export const MAX_STOPS = 10;

/** One pair's route: its preference-weighted cost and its jumps. */
export interface RouteCost {
  cost: number;
  jumps: number;
}

/** `[i][j]` is the route from point i to point j; `null` when no stargate route joins them. */
export type RouteCostMatrix = readonly (readonly (RouteCost | null)[])[];

export interface StopOrderOptions {
  /** The trip ends back at its start, and that last leg counts. */
  returnToStart?: boolean;
  /** The final stop is the real destination: only the stops before it move. */
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
  /** In flying order; with Return to start, the last leg comes home. */
  legs: TripLeg[];
  /** Set only when optimizing changed the order: the new order and the jumps either way. */
  reordered: { stops: number[]; typedJumps: number; jumps: number } | null;
  /** A stop no stargate route reaches: its legs have no route and the order cannot be optimized. */
  unreachable: boolean;
}

/**
 * Below this, two orders' costs are a tie. Costs are sums of 0.9, 1 and
 * exp(0.15 × penalty) steps, plus 1e12 per Avoided System entered — so a real
 * difference is never this small, while rounding on a sum near 1e13 can
 * reach a few thousandths. A relative tolerance would swamp real differences
 * there, so this one is absolute.
 */
const TIE = 1e-2;

/**
 * Directed, because a step's cost is charged for the system entered: from
 * highsec into lowsec costs more than the way back. Each row is its own sweep.
 */
export function pairwiseRouteCosts(
  graph: JumpGraph,
  points: readonly number[],
  options: FindJumpRouteOptions = {}
): RouteCostMatrix {
  return points.map((from) => {
    const sweep = routeSweepFrom(graph, from, options);
    return points.map((to) => costTo(sweep, graph, to));
  });
}

function costTo(
  sweep: ReturnType<typeof routeSweepFrom>,
  graph: JumpGraph,
  to: number
): RouteCost | null {
  const cost = sweep.costs.get(to);
  const jumps = sweep.jumps.get(to);
  if (!graph.has(to) || cost === undefined || jumps === undefined) return null;
  return { cost, jumps };
}

/** The total of flying `order` from point 0, or `null` when a leg has no route. */
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

/**
 * The visiting order of points 1…n, starting from point 0, with the lowest
 * total cost — exact, by Held-Karp over the stops free to move. The typed
 * order (1, 2, …, n) wins any tie, so an order only changes for a real saving.
 *
 * `null` when some pair has no route: no order can fly them all.
 */
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
  /** What the trip still costs after the free stops, ending at `stop`. */
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

/**
 * The legs of a trip from `start` through `stops`, in the typed order or the
 * cheapest one. Legs are drawn from the very sweeps the costs come from.
 *
 * A stop no stargate route reaches leaves the trip in its typed order, with
 * that stop's legs as `no-route`, and optimizing off until it is removed.
 */
export function planTrip(
  graph: JumpGraph,
  start: number,
  stops: readonly number[],
  routeOptions: FindJumpRouteOptions = {},
  tripOptions: TripOptions = {}
): TripPlan {
  const { optimize = false, returnToStart = false, keepLastStopLast = false } = tripOptions;
  const points = [start, ...stops];
  const sweeps = points.map((from) => routeSweepFrom(graph, from, routeOptions));
  const matrix: RouteCostMatrix = sweeps.map((sweep) =>
    points.map((to) => costTo(sweep, graph, to))
  );
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
