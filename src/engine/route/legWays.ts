/**
 * The ways to fly one Leg (issue #2477): by stargate alone, or through Thera
 * or Turnur — and the way a pilot pinned for it, which the leg is flown by
 * in place of the planner's pick.
 *
 * Pure. Forcing a leg through a hole is pieced together from ordinary sweeps:
 * the route to one end of the hole, the hole jump, and the route on from the
 * other end. The hole joins the search's options for that leg only — the
 * stargate graph is never touched, so Set waypoints still reads the hole
 * jump as a non-gate hop and cuts the waypoints at its entrance.
 *
 * Facts only (decision `20260912-172628`): the ways are listed side by side,
 * never ranked as better or worse.
 */
import {
  findJumpRoute,
  routeCost,
  routeSweepFrom,
  type FindJumpRouteOptions,
  type JumpGraph,
  type JumpRouteResult,
  type RouteSweep,
} from './jumpRoute';
import { holeNetwork, type HoleEnds } from './routeHoles';
import { HUB_SYSTEM_IDS, type TheraHub } from './theraConnections';

/** A hole a pin can name: its EVE-Scout id and the two systems it joins. */
export type PinnableHole = HoleEnds & { id: string };

/** The same search with every hole taken away: the preference and Avoided Systems stay. */
export function gatesOnlyOptions(options: FindJumpRouteOptions): FindJumpRouteOptions {
  return { ...options, extraConnections: undefined, freeSystems: undefined };
}

/** `options` with these holes added to whatever holes it already has. */
function withHoles(
  options: FindJumpRouteOptions,
  holes: readonly HoleEnds[]
): FindJumpRouteOptions {
  const added = holeNetwork(holes);
  return {
    ...options,
    extraConnections: [...(options.extraConnections ?? []), ...added.extraConnections],
    freeSystems: new Set([...(options.freeSystems ?? []), ...added.freeSystems]),
  };
}

/** `options` without the one connection joining an exit to its hub. */
function withoutHole(options: FindJumpRouteOptions, hole: HoleEnds): FindJumpRouteOptions {
  const hubId = HUB_SYSTEM_IDS[hole.hub];
  const joins = ([a, b]: readonly [number, number]) =>
    (a === hole.exitSystemId && b === hubId) || (a === hubId && b === hole.exitSystemId);
  return {
    ...options,
    extraConnections: (options.extraConnections ?? []).filter((pair) => !joins(pair)),
  };
}

/** A route that never visits a system twice: anything else is a detour, not a way. */
function simple(systems: readonly number[]): boolean {
  return new Set(systems).size === systems.length;
}

/**
 * The cheapest route from `from` to `to` that jumps through one of `holes`,
 * either way round: into the hub from its exit, or out of the hub to its exit.
 * The rest of the leg may use any hole `options` holds. A route that would
 * fly back out through the hole it came in by is never the answer.
 */
export function routeThroughHoles(
  graph: JumpGraph,
  from: number,
  to: number,
  holes: readonly HoleEnds[],
  options: FindJumpRouteOptions
): JumpRouteResult {
  if (holes.length === 0 || !graph.has(from) || !graph.has(to)) return { kind: 'no-route' };
  const forced = withHoles(options, holes);
  const sweeps = new Map<number, RouteSweep>();
  const sweep = (origin: number) => {
    let found = sweeps.get(origin);
    if (!found) {
      found = routeSweepFrom(graph, origin, forced);
      sweeps.set(origin, found);
    }
    return found;
  };

  let best: { systems: number[]; cost: number } | null = null;
  const consider = (systems: number[] | null) => {
    if (systems === null || !simple(systems)) return;
    const cost = routeCost(graph, systems, forced);
    if (cost < (best?.cost ?? Number.POSITIVE_INFINITY)) best = { systems, cost };
  };

  for (const hole of holes) {
    const hubId = HUB_SYSTEM_IDS[hole.hub];
    const exit = hole.exitSystemId;
    if (!graph.has(hubId) || !graph.has(exit)) continue;

    // Into the hub through this hole, then on from the hub.
    const toExit = sweep(from).routeTo(exit);
    if (toExit) {
      let onward = sweep(hubId).routeTo(to);
      if (onward && onward[1] === exit) {
        onward = routeSweepFrom(graph, hubId, withoutHole(forced, hole)).routeTo(to);
      }
      if (onward) consider([...toExit, ...onward]);
    }

    // To the hub some other way, then out through this hole. Graph and holes
    // run both ways, so the route on from the exit is the one back to it, reversed.
    let toHub = sweep(from).routeTo(hubId);
    if (toHub && toHub[toHub.length - 2] === exit) {
      toHub = routeSweepFrom(graph, from, withoutHole(forced, hole)).routeTo(hubId);
    }
    const back = sweep(to).routeTo(exit);
    if (toHub && back) consider([...toHub, ...[...back].reverse()]);
  }

  const found = best as { systems: number[] } | null;
  return found ? { kind: 'route', systems: found.systems } : { kind: 'no-route' };
}

/** One way to fly a leg: by gates alone, or the cheapest way through a hub. */
export interface LegWay {
  way: 'gates' | TheraHub;
  route: JumpRouteResult;
}

const HUBS: readonly TheraHub[] = ['thera', 'turnur'];

/**
 * Every way to fly a leg: gates only, always — even when no gate route flies
 * it, which is itself the fact to show — then each hub with a qualifying hole
 * whose way through actually reaches. `options` are the planner's, holes and all.
 */
export function legWays(
  graph: JumpGraph,
  from: number,
  to: number,
  options: FindJumpRouteOptions,
  holes: readonly HoleEnds[]
): LegWay[] {
  const ways: LegWay[] = [
    { way: 'gates', route: findJumpRoute(graph, from, to, gatesOnlyOptions(options)) },
  ];
  for (const hub of HUBS) {
    const hubHoles = holes.filter((hole) => hole.hub === hub);
    if (hubHoles.length === 0) continue;
    const route = routeThroughHoles(graph, from, to, hubHoles, options);
    if (route.kind === 'route') ways.push({ way: hub, route });
  }
  return ways;
}

/** How a pilot pinned a leg (`gates` | `thera` | `turnur` | an EVE-Scout hole id). */
export type LegPin =
  { kind: 'gates' } | { kind: 'hub'; hub: TheraHub } | { kind: 'hole'; id: string };

/**
 * A pin read from its link token, or `null` for a token that names nothing.
 * EVE-Scout ids are word characters.
 */
export function parseLegPin(token: string): LegPin | null {
  if (token === 'gates') return { kind: 'gates' };
  if (token === 'thera' || token === 'turnur') return { kind: 'hub', hub: token };
  return /^[\w-]{1,40}$/.test(token) ? { kind: 'hole', id: token } : null;
}

/** The link token a pin is written as. */
export function legPinToken(pin: LegPin): string {
  switch (pin.kind) {
    case 'gates':
      return 'gates';
    case 'hub':
      return pin.hub;
    case 'hole':
      return pin.id;
  }
}

/**
 * A pinned leg's route, or why it cannot be flown that way:
 * - `no-hole`: a hub pin, and that hub has no qualifying hole;
 * - `closed`: a hole pin, and EVE-Scout no longer lists that hole open;
 * - `no-route`: the pinned way does not reach the leg's far end.
 *
 * `qualifying` are the holes the filters allow; `listed` every open hole
 * EVE-Scout lists. A pinned hole is looked up in the second: the pilot chose
 * it by name, so it is flown even when the size or life filter would skip it.
 */
export type PinnedLegRoute<T extends PinnableHole> =
  | { kind: 'route'; systems: number[]; hole: T | null }
  | { kind: 'no-hole' }
  | { kind: 'closed' }
  | { kind: 'no-route' };

export function pinnedLegRoute<T extends PinnableHole>(
  graph: JumpGraph,
  from: number,
  to: number,
  pin: LegPin,
  options: FindJumpRouteOptions,
  lists: { qualifying: readonly T[]; listed: readonly T[] }
): PinnedLegRoute<T> {
  let route: JumpRouteResult;
  let hole: T | null = null;
  switch (pin.kind) {
    case 'gates':
      route = findJumpRoute(graph, from, to, gatesOnlyOptions(options));
      break;
    case 'hub': {
      const hubHoles = lists.qualifying.filter((candidate) => candidate.hub === pin.hub);
      if (hubHoles.length === 0) return { kind: 'no-hole' };
      route = routeThroughHoles(graph, from, to, hubHoles, options);
      break;
    }
    case 'hole': {
      hole = lists.listed.find((candidate) => candidate.id === pin.id) ?? null;
      if (hole === null) return { kind: 'closed' };
      route = routeThroughHoles(graph, from, to, [hole], options);
      break;
    }
  }
  return route.kind === 'route' ? { kind: 'route', systems: route.systems, hole } : route;
}
