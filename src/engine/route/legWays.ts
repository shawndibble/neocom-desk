import {
  findJumpRoute,
  routeCost,
  routeSweepFrom,
  type FindJumpRouteOptions,
  type JumpGraph,
  type JumpRouteResult,
  type RouteSweep,
} from './jumpRoute';
import { bridgeConnections, type AnsiblexGate } from './ansiblex';
import type { JumpSystem } from './jumpDrive';
import { routeWithJumps, type JumpDriveOptions } from './jumpLegs';
import { gatesOnlyOptions, longerThanGates } from './holeDetour';
import { holeNetwork, type HoleEnds } from './routeHoles';
import { HUB_SYSTEM_IDS, type TheraHub } from './theraConnections';

export interface JumpContext {
  systems: readonly JumpSystem[];
  drive: JumpDriveOptions;
}

export type PinnableHole = HoleEnds & { id: string };

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

function withoutHole(options: FindJumpRouteOptions, hole: HoleEnds): FindJumpRouteOptions {
  const hubId = HUB_SYSTEM_IDS[hole.hub];
  const joins = ([a, b]: readonly [number, number]) =>
    (a === hole.exitSystemId && b === hubId) || (a === hubId && b === hole.exitSystemId);
  return {
    ...options,
    extraConnections: (options.extraConnections ?? []).filter((pair) => !joins(pair)),
  };
}

function visitsEachOnce(systems: readonly number[]): boolean {
  return new Set(systems).size === systems.length;
}

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
    if (systems === null || !visitsEachOnce(systems)) return;
    const cost = routeCost(graph, systems, forced);
    if (cost < (best?.cost ?? Number.POSITIVE_INFINITY)) best = { systems, cost };
  };

  for (const hole of holes) {
    const hubId = HUB_SYSTEM_IDS[hole.hub];
    const exit = hole.exitSystemId;
    if (!graph.has(hubId) || !graph.has(exit)) continue;

    const toExit = sweep(from).routeTo(exit);
    if (toExit) {
      let onward = sweep(hubId).routeTo(to);
      if (onward && onward[1] === exit) {
        onward = routeSweepFrom(graph, hubId, withoutHole(forced, hole)).routeTo(to);
      }
      if (onward) consider([...toExit, ...onward]);
    }

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

export function routeOverBridges(
  graph: JumpGraph,
  from: number,
  to: number,
  bridges: readonly AnsiblexGate[],
  options: FindJumpRouteOptions
): JumpRouteResult {
  if (bridges.length === 0) return { kind: 'no-route' };
  const route = findJumpRoute(graph, from, to, {
    ...gatesOnlyOptions(options),
    extraConnections: bridgeConnections(bridges),
  });
  if (route.kind !== 'route') return route;
  const crossesBridge = route.systems.some(
    (id, index) => index > 0 && !graph.get(route.systems[index - 1])?.includes(id)
  );
  return crossesBridge ? route : { kind: 'no-route' };
}

export function routeOverJumps(
  graph: JumpGraph,
  from: number,
  to: number,
  jump: JumpContext | null,
  options: FindJumpRouteOptions
): JumpRouteResult {
  if (jump === null) return { kind: 'no-route' };
  const route = routeWithJumps(
    graph,
    jump.systems,
    from,
    to,
    jump.drive,
    gatesOnlyOptions(options)
  );
  return route.kind === 'route' ? { kind: 'route', systems: route.systems } : route;
}

export interface LegWay {
  way: 'gates' | TheraHub | 'ansiblex' | 'jump';
  route: JumpRouteResult;
}

const HUBS: readonly TheraHub[] = ['thera', 'turnur'];

export function legWays(
  graph: JumpGraph,
  from: number,
  to: number,
  options: FindJumpRouteOptions,
  holes: readonly HoleEnds[],
  bridges: readonly AnsiblexGate[] = [],
  jump: JumpContext | null = null
): LegWay[] {
  const gates = findJumpRoute(graph, from, to, gatesOnlyOptions(options));
  const ways: LegWay[] = [{ way: 'gates', route: gates }];
  for (const hub of HUBS) {
    const hubHoles = holes.filter((hole) => hole.hub === hub);
    if (hubHoles.length === 0) continue;
    const route = routeThroughHoles(graph, from, to, hubHoles, options);
    if (route.kind === 'route' && !longerThanGates(route.systems, gates)) {
      ways.push({ way: hub, route });
    }
  }
  const overBridges = routeOverBridges(graph, from, to, bridges, options);
  if (overBridges.kind === 'route') ways.push({ way: 'ansiblex', route: overBridges });
  const byDrive = routeOverJumps(graph, from, to, jump, options);
  if (byDrive.kind === 'route') ways.push({ way: 'jump', route: byDrive });
  return ways;
}

export type LegPin =
  | { kind: 'gates' }
  | { kind: 'hub'; hub: TheraHub }
  | { kind: 'hole'; id: string }
  | { kind: 'ansiblex' }
  | { kind: 'jump' };

export function parseLegPin(token: string): LegPin | null {
  if (token === 'gates') return { kind: 'gates' };
  if (token === 'thera' || token === 'turnur') return { kind: 'hub', hub: token };
  if (token === 'ansiblex') return { kind: 'ansiblex' };
  if (token === 'jump') return { kind: 'jump' };
  return /^[\w-]{1,40}$/.test(token) ? { kind: 'hole', id: token } : null;
}

export function pinWaitsOnHoleList(pin: LegPin): pin is Extract<LegPin, { kind: 'hub' | 'hole' }> {
  return pin.kind === 'hub' || pin.kind === 'hole';
}

export type PinnedLegRoute<T extends PinnableHole> =
  | { kind: 'route'; systems: number[]; hole: T | null }
  | { kind: 'no-hole' }
  | { kind: 'closed' }
  | { kind: 'no-bridge' }
  | { kind: 'no-route' };

export function pinnedLegRoute<T extends PinnableHole>(
  graph: JumpGraph,
  from: number,
  to: number,
  pin: LegPin,
  options: FindJumpRouteOptions,
  lists: {
    qualifying: readonly T[];
    listed: readonly T[];
    bridges?: readonly AnsiblexGate[];
    jump?: JumpContext | null;
  }
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
    case 'ansiblex': {
      const bridges = lists.bridges ?? [];
      if (bridges.length === 0) return { kind: 'no-bridge' };
      route = routeOverBridges(graph, from, to, bridges, options);
      break;
    }
    case 'jump':
      route = routeOverJumps(graph, from, to, lists.jump ?? null, options);
      break;
  }
  return route.kind === 'route' ? { kind: 'route', systems: route.systems, hole } : route;
}
