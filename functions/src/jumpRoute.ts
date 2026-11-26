export type JumpGraph = ReadonlyMap<number, readonly number[]>;

export type RoutePreferenceKind = 'shortest' | 'prefer-highsec' | 'avoid-highsec';

export type JumpRouteResult = { kind: 'route'; systems: number[] } | { kind: 'no-route' };

export interface FindJumpRouteOptions {
  preference?: RoutePreferenceKind;
  securityOf?: (systemId: number) => number | undefined;
  securityPenalty?: number;
  avoid?: ReadonlySet<number>;
  extraConnections?: readonly (readonly [number, number])[];
  freeSystems?: ReadonlySet<number>;
}

export const DEFAULT_SECURITY_PENALTY = 50;

const HIGHSEC_FROM = 0.45;

const WANTED_COST = 0.9;

const AVOIDED_PENALTY = 1e12;

function securityStepCost(
  preference: RoutePreferenceKind,
  securityOf: FindJumpRouteOptions['securityOf'],
  securityPenalty: number
): (systemId: number) => number {
  if (preference === 'shortest' || !securityOf) return () => 1;
  const penaltyCost = Math.exp(0.15 * securityPenalty);
  const wantHighsec = preference === 'prefer-highsec';
  return (systemId) => {
    const security = securityOf(systemId);
    if (security === undefined) return penaltyCost;
    if (security <= 0) return 2 * penaltyCost;
    return security >= HIGHSEC_FROM === wantHighsec ? WANTED_COST : penaltyCost;
  };
}

export type StepCost = (systemId: number, viaExtra: boolean) => number;

export function stepCostFor(options: FindJumpRouteOptions): StepCost {
  const base = securityStepCost(
    options.preference ?? 'shortest',
    options.securityOf,
    options.securityPenalty ?? DEFAULT_SECURITY_PENALTY
  );
  const free = options.freeSystems ?? new Set<number>();
  const avoid = options.avoid ?? new Set<number>();
  return (systemId, viaExtra) =>
    (viaExtra && free.has(systemId) ? 1 : base(systemId)) +
    (avoid.has(systemId) ? AVOIDED_PENALTY : 0);
}

interface Neighbours {
  gates: (systemId: number) => readonly number[];
  extra: (systemId: number) => readonly number[];
}

const NONE: readonly number[] = [];

function neighboursFor(graph: JumpGraph, options: FindJumpRouteOptions): Neighbours {
  const gates = (systemId: number) => graph.get(systemId) ?? NONE;
  const added = new Map<number, number[]>();
  const link = (from: number, to: number) => {
    const list = added.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    added.set(from, list);
  };
  for (const [a, b] of options.extraConnections ?? []) {
    if (a === b || !graph.has(a) || !graph.has(b)) continue;
    link(a, b);
    link(b, a);
  }
  return { gates, extra: (systemId) => added.get(systemId) ?? NONE };
}

export class CostQueue {
  private readonly heap: { systemId: number; cost: number }[] = [];

  push(systemId: number, cost: number): void {
    this.heap.push({ systemId, cost });
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.heap[parent].cost <= this.heap[index].cost) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  pop(): { systemId: number; cost: number } | undefined {
    const top = this.heap[0];
    const last = this.heap.pop();
    if (last !== undefined && this.heap.length > 0) {
      this.heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.heap.length && this.heap[left].cost < this.heap[smallest].cost)
          smallest = left;
        if (right < this.heap.length && this.heap[right].cost < this.heap[smallest].cost)
          smallest = right;
        if (smallest === index) break;
        [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
        index = smallest;
      }
    }
    return top;
  }
}

function reconstruct(cameFrom: ReadonlyMap<number, number>, destination: number): number[] {
  const systems: number[] = [];
  for (let id: number | undefined = destination; id !== undefined; id = cameFrom.get(id)) {
    systems.push(id);
  }
  return systems.reverse();
}

interface SearchResult {
  cameFrom: ReadonlyMap<number, number>;
  jumps: ReadonlyMap<number, number>;
  costs: ReadonlyMap<number, number>;
  reachedStopAt: boolean;
}

function search(
  neighbours: Neighbours,
  originSystemId: number,
  stepCost: StepCost,
  stopAt?: number
): SearchResult {
  const best = new Map<number, number>([[originSystemId, 0]]);
  const jumps = new Map<number, number>([[originSystemId, 0]]);
  const cameFrom = new Map<number, number>();
  const settled = new Set<number>();
  const queue = new CostQueue();
  queue.push(originSystemId, 0);

  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    const { systemId, cost } = next;
    if (settled.has(systemId)) continue;
    settled.add(systemId);
    if (systemId === stopAt) return { cameFrom, jumps, costs: best, reachedStopAt: true };
    for (const viaExtra of [false, true]) {
      for (const neighbour of viaExtra ? neighbours.extra(systemId) : neighbours.gates(systemId)) {
        const neighbourCost = cost + stepCost(neighbour, viaExtra);
        if (neighbourCost >= (best.get(neighbour) ?? Number.POSITIVE_INFINITY)) continue;
        best.set(neighbour, neighbourCost);
        jumps.set(neighbour, (jumps.get(systemId) ?? 0) + 1);
        cameFrom.set(neighbour, systemId);
        queue.push(neighbour, neighbourCost);
      }
    }
  }

  return { cameFrom, jumps, costs: best, reachedStopAt: false };
}

export function findJumpRoute(
  graph: JumpGraph,
  originSystemId: number,
  destinationSystemId: number,
  options: FindJumpRouteOptions = {}
): JumpRouteResult {
  if (!graph.has(originSystemId) || !graph.has(destinationSystemId)) return { kind: 'no-route' };
  if (originSystemId === destinationSystemId) {
    return { kind: 'route', systems: [originSystemId] };
  }

  const stepCost = stepCostFor(options);
  const { cameFrom, reachedStopAt } = search(
    neighboursFor(graph, options),
    originSystemId,
    stepCost,
    destinationSystemId
  );
  if (!reachedStopAt) return { kind: 'no-route' };
  return { kind: 'route', systems: reconstruct(cameFrom, destinationSystemId) };
}

export function jumpDistancesFrom(
  graph: JumpGraph,
  originSystemId: number,
  options: FindJumpRouteOptions = {}
): ReadonlyMap<number, number> {
  if (!graph.has(originSystemId)) return new Map();
  const stepCost = stepCostFor(options);
  return search(neighboursFor(graph, options), originSystemId, stepCost).jumps;
}

export interface RouteSweep {
  costs: ReadonlyMap<number, number>;
  jumps: ReadonlyMap<number, number>;
  routeTo(systemId: number): number[] | null;
}

export function routeSweepFrom(
  graph: JumpGraph,
  originSystemId: number,
  options: FindJumpRouteOptions = {}
): RouteSweep {
  if (!graph.has(originSystemId)) {
    return { costs: new Map(), jumps: new Map(), routeTo: () => null };
  }
  const { cameFrom, jumps, costs } = search(
    neighboursFor(graph, options),
    originSystemId,
    stepCostFor(options)
  );
  return {
    costs,
    jumps,
    routeTo: (systemId) =>
      graph.has(systemId) && costs.has(systemId) ? reconstruct(cameFrom, systemId) : null,
  };
}

export function routeCost(
  graph: JumpGraph,
  systems: readonly number[],
  options: FindJumpRouteOptions = {}
): number {
  const stepCost = stepCostFor(options);
  const neighbours = neighboursFor(graph, options);
  let total = 0;
  for (let index = 1; index < systems.length; index += 1) {
    const from = systems[index - 1];
    const to = systems[index];
    const byGate = neighbours.gates(from).includes(to) ? stepCost(to, false) : Infinity;
    const byExtra = neighbours.extra(from).includes(to) ? stepCost(to, true) : Infinity;
    total += Math.min(byGate, byExtra);
  }
  return total;
}
