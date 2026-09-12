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
 * Adjacency by solar system id. Every system the snapshot knows has an entry;
 * an empty one is a system with no stargates, which is J-space's real shape
 * rather than a gap. An id with no entry at all is therefore not a system
 * this snapshot knows — the distinction a same-system route depends on.
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

export type JumpRouteResult = { kind: 'route'; systems: number[] } | { kind: 'no-route' };

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
  /** Predecessor on the best path, for every system reached but the origin. */
  cameFrom: ReadonlyMap<number, number>;
  /** Jumps along that path — the trip's length, not its preference-weighted cost. */
  jumps: ReadonlyMap<number, number>;
  /** Set when the search was given a `stopAt` and reached it. */
  reachedStopAt: boolean;
}

/**
 * One Dijkstra from `origin`, shared by both public entry points.
 *
 * `stopAt` is what keeps a single-pair lookup cheap: with it the search
 * returns as soon as that system settles, and without it every reachable
 * system settles, which is what makes a whole table's worth of distances cost
 * one sweep instead of one sweep per row.
 *
 * Jumps are tracked beside cost because the two differ under a biased
 * preference — a 4-jump highsec route costs less than a 2-jump route through
 * lowsec, and it is the jump count a reader is shown.
 */
function search(
  graph: JumpGraph,
  originSystemId: number,
  stepCost: (systemId: number) => number,
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
    // A system can sit in the heap more than once; the first pop is its final
    // cost, so later copies are stale and skipped rather than re-expanded.
    if (settled.has(systemId)) continue;
    settled.add(systemId);
    if (systemId === stopAt) return { cameFrom, jumps, reachedStopAt: true };
    for (const neighbour of graph.get(systemId) ?? []) {
      const neighbourCost = cost + stepCost(neighbour);
      // Also rejects an already-settled neighbour: its recorded cost is final,
      // and every weight is positive, so no later path can undercut it.
      if (neighbourCost >= (best.get(neighbour) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(neighbour, neighbourCost);
      jumps.set(neighbour, (jumps.get(systemId) ?? 0) + 1);
      cameFrom.set(neighbour, systemId);
      queue.push(neighbour, neighbourCost);
    }
  }

  return { cameFrom, jumps, reachedStopAt: false };
}

/**
 * The stargate route between two systems, as the ordered list of systems
 * crossed — both ends included, so the jump count is `systems.length - 1`.
 *
 * Same system for both ends is zero jumps, which is a real answer and
 * deliberately not `no-route` — including in a gateless system, where you are
 * already where you are going. An id the snapshot holds no entry for is not a
 * system it knows, and that is `no-route`, deliberately not zero jumps.
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
  const { cameFrom, reachedStopAt } = search(graph, originSystemId, stepCost, destinationSystemId);
  if (!reachedStopAt) return { kind: 'no-route' };
  return { kind: 'route', systems: reconstruct(cameFrom, destinationSystemId) };
}

/**
 * Jumps from one origin to *every* system it can reach, in one pass.
 *
 * A table ranking hauls by distance asks the same origin about many
 * destinations, and one sweep to exhaustion costs about what two single-pair
 * lookups do while answering all of them — so a per-row call is the shape to
 * avoid, not a cost to absorb. The ESI resolver this replaces caches each
 * pair (`features/character/routeDistance.ts`); reaching for a pair at a time
 * here would make the local path the slower of the two, which is the opposite
 * of the point.
 *
 * The origin maps to 0. A system absent from the result is unreachable by
 * stargate — a fact, not a gap — and an origin the graph does not hold yields
 * an empty map rather than a map claiming it can reach itself.
 */
export function jumpDistancesFrom(
  graph: JumpGraph,
  originSystemId: number,
  options: FindJumpRouteOptions = {}
): ReadonlyMap<number, number> {
  if (!graph.has(originSystemId)) return new Map();
  const stepCost = stepCostFor(options.preference ?? 'shortest', options.securityOf);
  return search(graph, originSystemId, stepCost).jumps;
}
