/**
 * Stargate pathfinding over the local jump graph (issue #942) — the free,
 * request-free answer to "how far apart are these two systems, and what does
 * the trip cross".
 *
 * Distance used to cost one ESI request per pair (an ESI `/route/` call),
 * and that is why every feature
 * wanting a distance over *many* rows has so far had to settle for showing it
 * one opened row at a time: fifty rows meant fifty requests before a table
 * could sort. The graph is static map data, so shipping it locally turns a
 * distance into arithmetic and lets it be a sortable column.
 *
 * Pure, per CLAUDE.md: no fetch, no DOM, no Dexie. The caller supplies both
 * the graph and the security lookup; `sde/jumpGraph.ts` is what reads them off
 * the snapshots.
 */

/**
 * Adjacency by solar system id. Every system the snapshot knows has an entry;
 * an empty one is a system with no stargates, which is J-space's real shape
 * rather than a gap. An id with no entry at all is therefore not a system
 * this snapshot knows — the distinction a same-system route depends on.
 */
export type JumpGraph = ReadonlyMap<number, readonly number[]>;

/**
 * Which trip the caller is asking about — the game's Prefer Shorter, Prefer
 * Safer and Prefer Less Secure, and ESI's `Shorter`/`Safer`/`LessSecure`
 * (`features/route/esiRoute.ts` maps them), named for what they do since
 * nothing here talks to ESI.
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
  /**
   * 0–100, the game's default 50: how strongly a biased preference bends the
   * route, as the in-game slider does. Ignored by `shortest`.
   */
  securityPenalty?: number;
  /**
   * The pilot's Avoided Systems. Like the security bias, a cost rather than
   * a wall: a destination only reachable through one still gets a route, and
   * the route crosses as few of them as it can. Reaching one is not crossing
   * it — an avoided origin or destination changes nothing, since every route
   * between the same two ends pays for it alike.
   */
  avoid?: ReadonlySet<number>;
  /**
   * Two-way connections the stargate graph does not hold — Route Safety's
   * open Thera / Turnur holes (issue #2476). Each crossing is one jump, and
   * like a stargate it charges the system it lands in. A connection to a
   * system the graph has no entry for is ignored. Nothing here knows which
   * systems are hubs: the caller builds these from whatever list it trusts.
   */
  extraConnections?: readonly (readonly [number, number])[];
  /**
   * Systems entered for one jump's cost whatever their security, when — and
   * only when — entered over an extra connection: the hub a hole leads to, so
   * a -0.99 Thera does not price every hole out of a Prefer safer route.
   * Entered by stargate (Turnur has gates) such a system is charged as any
   * other. Only the security cost is waived: an Avoided System here is still
   * avoided.
   */
  freeSystems?: ReadonlySet<number>;
}

/** The game's default security penalty. */
export const DEFAULT_SECURITY_PENALTY = 50;

/** The line CCP's route costs draw highsec at, on the raw status. */
const HIGHSEC_FROM = 0.45;

/** What entering a wanted system costs: CCP's 0.9, just under Shorter's 1. */
const WANTED_COST = 0.9;

/**
 * What entering an Avoided System costs: above any route's total security
 * cost — at the harshest penalty, exp(15) × 2 per nullsec jump is ~6.5e6, and
 * no route is thousands of jumps long — so crossing one fewer avoided system
 * always wins. The pilot named those systems; the security bias is a default.
 */
const AVOIDED_PENALTY = 1e12;

/**
 * CCP's own per-jump costs (developers.eveonline.com, "Route Calculation"),
 * charged for the system jumped into, so a local route agrees with ESI's
 * `/route/` and the game's autopilot:
 *
 * - penalty cost = exp(0.15 × penalty), the slider running 0–100;
 * - nullsec (≤ 0.0) costs twice that under both biased preferences;
 * - the other unwanted band costs it once, the wanted band 0.9.
 *
 * So penalty 0 is not quite Shorter — it still leans 0.9 against 1 and
 * counts nullsec double — and that is the game's behaviour, not a rounding.
 *
 * An unknown security is charged as unwanted. The conservative reading is the
 * only honest one: a Safer route must never claim safety for a system the
 * snapshot cannot vouch for.
 */
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

/** What entering a system costs, by stargate (`viaExtra` false) or over an extra connection. */
type StepCost = (systemId: number, viaExtra: boolean) => number;

function stepCostFor(options: FindJumpRouteOptions): StepCost {
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

/**
 * Where the search can go from one system: its stargates, then any extra
 * connections to systems the graph knows. The stargate graph itself is
 * shared and never touched.
 */
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
  /** The path's preference-weighted cost — what the search minimised. */
  costs: ReadonlyMap<number, number>;
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
    // A system can sit in the heap more than once; the first pop is its final
    // cost, so later copies are stale and skipped rather than re-expanded.
    if (settled.has(systemId)) continue;
    settled.add(systemId);
    if (systemId === stopAt) return { cameFrom, jumps, costs: best, reachedStopAt: true };
    // Stargates first, so on a tie the gate is the jump taken.
    for (const viaExtra of [false, true]) {
      for (const neighbour of viaExtra ? neighbours.extra(systemId) : neighbours.gates(systemId)) {
        const neighbourCost = cost + stepCost(neighbour, viaExtra);
        // Also rejects an already-settled neighbour: its recorded cost is final,
        // and every weight is positive, so no later path can undercut it.
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

/**
 * Jumps from one origin to *every* system it can reach, in one pass.
 *
 * A table ranking hauls by distance asks the same origin about many
 * destinations, and one sweep to exhaustion costs about what two single-pair
 * lookups do while answering all of them — so a per-row call is the shape to
 * avoid, not a cost to absorb. The ESI resolver this replaced cached each
 * pair; reaching for a pair at a time
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
  const stepCost = stepCostFor(options);
  return search(neighboursFor(graph, options), originSystemId, stepCost).jumps;
}

/** Every route from one origin, from a single sweep. */
export interface RouteSweep {
  /** Preference-weighted cost to each reachable system — what the route minimised. */
  costs: ReadonlyMap<number, number>;
  /** Jumps along each of those routes. */
  jumps: ReadonlyMap<number, number>;
  /** The route to one system, both ends included, or `null` when none reaches it. */
  routeTo(systemId: number): number[] | null;
}

/**
 * The cost, jumps and route from one origin to every system it reaches —
 * the same search, under the same options, that `findJumpRoute` runs for one
 * pair, so a cost read here is the cost of the route a leg is drawn with.
 *
 * Multi-stop planning reads its pairwise costs from these: one sweep per stop
 * rather than one search per pair of stops.
 */
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

/**
 * What a given route costs under these options, step by step, as the search
 * would have priced it: each system entered by stargate, or over an extra
 * connection where no stargate joins the two (or the extra one is cheaper).
 * A step nothing joins makes the route unflyable: infinite.
 *
 * For comparing routes built outside one search — a leg forced through a
 * chosen hole is pieced together from several sweeps (`legWays.ts`).
 */
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
