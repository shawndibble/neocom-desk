/**
 * Stargate pathfinding over the local jump graph (issue #942) — the free,
 * request-free answer to "how far apart are these two systems, and what does
 * the trip cross".
 *
 * Distance used to cost one ESI request per pair (`features/character/
 * routeDistance.ts`, which asks `/route/`), and that is why every feature
 * wanting a distance over *many* rows has so far had to settle for showing it
 * one opened row at a time: fifty rows meant fifty requests before a table
 * could sort. The graph is static map data, so shipping it locally turns a
 * distance into arithmetic and lets it be a sortable column.
 *
 * Pure, per CLAUDE.md: no fetch, no DOM, no Dexie. The caller supplies both
 * the graph and the security lookup; `sde/jumpGraph.ts` is what reads them off
 * the snapshots.
 */
import { securityBand } from '@/engine/securityStatus';

/**
 * Adjacency by solar system id. A system with no entry has no stargates that
 * this snapshot knows of — which for wormhole space is not a gap but the
 * truth, since J-space carries no stargates at all.
 */
export type JumpGraph = ReadonlyMap<number, readonly number[]>;

/**
 * Which trip the caller is asking about. Mirrors the three flags ESI's own
 * `/route/` accepts (`shortest`/`secure`/`insecure`), named for what they do
 * rather than for ESI's wording, since nothing here talks to ESI.
 *
 * Both biased preferences are *preferences*, not filters: they make the
 * unwanted space expensive, never impassable, so a destination only reachable
 * through it still gets a route. A hard filter would answer "no route" for
 * every nullsec delivery under `prefer-highsec`, which is a different — and
 * false — statement about the game.
 */
export type RoutePreferenceKind = 'shortest' | 'prefer-highsec' | 'avoid-highsec';

export type JumpRouteResult =
  | { kind: 'route'; systems: number[] }
  /** The two ends genuinely do not connect by stargate. Never "zero jumps". */
  | { kind: 'no-route' };

export interface FindJumpRouteOptions {
  preference?: RoutePreferenceKind;
  /**
   * Raw security status for a system id, or `undefined` where the snapshot
   * does not say. Optional: without it every preference degrades to
   * `shortest`, because a bias with nothing to bias on is just a longer way
   * of counting jumps.
   */
  securityOf?: (systemId: number) => number | undefined;
}

/**
 * What entering an unwanted system costs, in units of one jump. Any route
 * that avoids a single unwanted system beats any route that takes one,
 * because no route in New Eden is thousands of jumps long — so this orders
 * by "unwanted systems crossed" first and "jumps" only as the tie-break,
 * with one scalar instead of a pair.
 */
const UNWANTED_PENALTY = 10_000;

/**
 * An unknown security is treated as *not* highsec. The conservative reading
 * is the only honest one: a `prefer-highsec` route must never claim safety
 * for a system the snapshot cannot vouch for.
 */
function isHighsec(systemId: number, securityOf: (id: number) => number | undefined): boolean {
  const security = securityOf(systemId);
  return security !== undefined && securityBand(security) === 'highsec';
}

function stepCostFor(
  preference: RoutePreferenceKind,
  securityOf: FindJumpRouteOptions['securityOf']
): (systemId: number) => number {
  if (preference === 'shortest' || !securityOf) return () => 1;
  const avoidHighsec = preference === 'avoid-highsec';
  return (systemId) =>
    isHighsec(systemId, securityOf) === avoidHighsec ? 1 + UNWANTED_PENALTY : 1;
}

/**
 * A binary min-heap keyed on cost. The graph is ~8,500 systems and ~14,000
 * edges, so this is never the expensive part — but a linear scan for the
 * cheapest frontier node would make it O(n²) for no reason.
 */
class CostQueue {
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
    if (last && this.heap.length > 0) {
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

  get size(): number {
    return this.heap.length;
  }
}

function reconstruct(cameFrom: ReadonlyMap<number, number>, destination: number): number[] {
  const systems = [destination];
  let current = destination;
  for (let step = cameFrom.get(current); step !== undefined; step = cameFrom.get(current)) {
    current = step;
    systems.push(current);
  }
  return systems.reverse();
}

/**
 * The stargate route between two systems, as the ordered list of systems
 * crossed — both ends included, so the jump count is `systems.length - 1` and
 * `engine/jumpsAway.ts`'s `jumpsAwayFromRoute` reads it unchanged.
 *
 * Same system for both ends is zero jumps, which is a real answer and
 * deliberately not `no-route`. An end the graph does not hold — a wormhole
 * system, or an id from a snapshot this one predates — is `no-route`, which
 * is deliberately not zero jumps.
 */
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

  const stepCost = stepCostFor(options.preference ?? 'shortest', options.securityOf);
  const best = new Map<number, number>([[originSystemId, 0]]);
  const cameFrom = new Map<number, number>();
  const settled = new Set<number>();
  const queue = new CostQueue();
  queue.push(originSystemId, 0);

  while (queue.size > 0) {
    const next = queue.pop();
    if (!next) break;
    const { systemId, cost } = next;
    // A node can sit in the heap more than once; the first pop is its final
    // cost, so later copies are stale and skipped rather than re-expanded.
    if (settled.has(systemId)) continue;
    settled.add(systemId);
    if (systemId === destinationSystemId) {
      return { kind: 'route', systems: reconstruct(cameFrom, destinationSystemId) };
    }
    for (const neighbour of graph.get(systemId) ?? []) {
      if (settled.has(neighbour)) continue;
      const neighbourCost = cost + stepCost(neighbour);
      if (neighbourCost >= (best.get(neighbour) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(neighbour, neighbourCost);
      cameFrom.set(neighbour, systemId);
      queue.push(neighbour, neighbourCost);
    }
  }

  return { kind: 'no-route' };
}
