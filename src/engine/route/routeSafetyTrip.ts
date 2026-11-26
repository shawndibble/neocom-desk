import { bridgeBetween, bridgeConnections, type AnsiblexGate } from './ansiblex';
import { lightYearDistance, type SystemPosition } from './jumpDrive';
import { jumpWayFacts, type JumpDriveOptions, type JumpHop, type JumpWayFacts } from './jumpLegs';
import { findJumpRoute, type FindJumpRouteOptions, type JumpGraph } from './jumpRoute';
import { crossesHole, gatesOnlyOptions, longerThanGates, noHoleOptions } from './holeDetour';
import {
  legWays,
  type JumpContext,
  parseLegPin,
  pinWaitsOnHoleList,
  pinnedLegRoute,
  type LegWay,
  type PinnableHole,
  type PinnedLegRoute,
} from './legWays';
import { holeBetween, holeNetwork, type HoleEnds, type HoleNetwork } from './routeHoles';
import {
  buildRouteSafetyRows,
  joinLegs,
  summarizeRouteSafety,
  summarizeTrip,
  type RouteSafetyInputs,
  type RouteSafetyRow,
  type RouteSafetySummary,
  type RouteSafetySystemEntry,
  type SystemKills,
} from './routeSafety';
import type { TheraConnection } from './theraConnections';
import type { TripLeg, TripPlan } from './tripPlan';

export type RouteStep =
  | { kind: 'gate' }
  | { kind: 'hole'; hole: TheraConnection }
  | { kind: 'bridge'; gate: AnsiblexGate }
  | { kind: 'jump'; distanceLy: number };

export interface RouteSafetyTripRow extends RouteSafetyRow {
  entry: RouteStep | null;
}

export interface RouteSafetyWayHole {
  from: number;
  to: number;
  hole: TheraConnection;
}

export interface RouteSafetyWayBridge {
  from: number;
  to: number;
  gate: AnsiblexGate;
}

export interface RouteSafetyWay {
  kind: 'planner' | 'gates' | 'thera' | 'turnur' | 'hole' | 'ansiblex' | 'jump';
  pin: string | null;
  summary: RouteSafetySummary | null;
  holes: RouteSafetyWayHole[];
  bridges: RouteSafetyWayBridge[];
  jump: JumpWayFacts | null;
  inUse: boolean;
}

export type LegPinNote = 'closed' | 'no-hole' | 'no-route' | 'no-list' | 'no-bridge';

export interface RouteSafetyLeg {
  from: number;
  to: number;
  rows: RouteSafetyTripRow[] | null;
  summary: RouteSafetySummary | null;
  ways: RouteSafetyWay[];
  pin: string;
  pinNote: LegPinNote | null;
}

export interface RouteSafetyTrip {
  rows: RouteSafetyTripRow[];
  stopIndexes: number[];
  summary: RouteSafetySummary;
  holeJumps: number;
  bridgeJumps: number;
  driveJumps: number;
  jump: JumpWayFacts | null;
}

export interface PlannedTrip {
  plan: TripPlan;
  graph: JumpGraph;
  options: FindJumpRouteOptions;
}

export interface LegAlternatives {
  ways: LegWay[];
  pinned: PinnedLegRoute<PinnableHole> | null;
}

export function gatesOverLongerHoles<T extends PlannedTrip>(trip: T): T {
  const { plan, graph, options } = trip;
  let changed = false;
  const legs = plan.legs.map((leg): TripLeg => {
    if (leg.route.kind !== 'route' || !crossesHole(graph, leg.route.systems)) return leg;
    const gates = findJumpRoute(graph, leg.from, leg.to, gatesOnlyOptions(options));
    if (!longerThanGates(leg.route.systems, gates)) return leg;
    changed = true;
    return { ...leg, route: findJumpRoute(graph, leg.from, leg.to, noHoleOptions(options)) };
  });
  if (!changed) return trip;
  const jumps = legs.reduce(
    (sum, leg) => sum + (leg.route.kind === 'route' ? leg.route.systems.length - 1 : 0),
    0
  );
  const reordered = plan.reordered && { ...plan.reordered, jumps };
  return { ...trip, plan: { ...plan, legs, reordered } };
}

export function routeSafetyNetwork(
  holes: readonly HoleEnds[],
  bridges: readonly AnsiblexGate[]
): HoleNetwork {
  const holeNet = holeNetwork(holes);
  return {
    extraConnections: [...holeNet.extraConnections, ...bridgeConnections(bridges)],
    freeSystems: holeNet.freeSystems,
  };
}

export function planLegAlternatives(
  trip: PlannedTrip,
  network: { holes: readonly HoleEnds[]; bridges: readonly AnsiblexGate[] },
  pins: { tokens: readonly string[]; listed: readonly PinnableHole[] | null },
  jump: JumpContext | null = null
): { legs: LegAlternatives[]; systemIds: number[] } {
  const { plan, graph, options } = trip;
  const crossed = new Set<number>();
  const cross = (systems: readonly number[]) => systems.forEach((id) => crossed.add(id));
  const qualifying = network.holes.map((ends) => ({ ...ends, id: '' }));
  const legs = plan.legs.map((leg, index): LegAlternatives => {
    if (leg.route.kind === 'route') cross(leg.route.systems);
    const ways = legWays(graph, leg.from, leg.to, options, network.holes, network.bridges, jump);
    for (const way of ways) if (way.route.kind === 'route') cross(way.route.systems);
    const pin = parseLegPin(pins.tokens[index] ?? '');
    const waiting = pins.listed === null && pin !== null && pinWaitsOnHoleList(pin);
    const pinned =
      pin === null || waiting
        ? null
        : pinnedLegRoute(graph, leg.from, leg.to, pin, options, {
            qualifying,
            listed: pins.listed ?? [],
            bridges: network.bridges,
            jump,
          });
    if (pinned?.kind === 'route') cross(pinned.systems);
    return { ways, pinned };
  });
  return { legs, systemIds: [...crossed] };
}

export interface RouteSafetyActivity {
  kills: ReadonlyMap<number, SystemKills> | null;
  jumps: ReadonlyMap<number, number> | null;
  fetchedAt: Date | null;
}

export interface RouteSafetyTripInput {
  planned: Pick<PlannedTrip, 'plan' | 'graph'>;
  alternatives: readonly LegAlternatives[];
  singleStop: boolean;
  pins: readonly string[];
  holes: readonly TheraConnection[];
  listed: readonly TheraConnection[] | null;
  bridges: readonly AnsiblexGate[] | null;
  systems: ReadonlyMap<number, RouteSafetySystemEntry>;
  regionNames: ReadonlyMap<number, string>;
  activity: RouteSafetyActivity | null;
  lawless?: ReadonlySet<number>;
  jump?: {
    positions: ReadonlyMap<number, SystemPosition>;
    drive: Pick<JumpDriveOptions, 'fuelPerLy' | 'distanceFactor'>;
  } | null;
}

export type RouteSafetyAssembly =
  | { kind: 'no-route' }
  | {
      kind: 'route';
      legs: RouteSafetyLeg[];
      trip: RouteSafetyTrip | null;
      reordered: TripPlan['reordered'];
      unreachable: boolean;
      fetchedAt: Date | null;
      activityLoading: boolean;
      activityUnavailable: boolean;
    };

const GATE_STEP: RouteStep = { kind: 'gate' };

export function stepJumps(rows: readonly Pick<RouteSafetyTripRow, 'entry'>[]): {
  holeJumps: number;
  bridgeJumps: number;
  driveJumps: number;
} {
  let holeJumps = 0;
  let bridgeJumps = 0;
  let driveJumps = 0;
  for (const { entry } of rows) {
    if (entry?.kind === 'hole') holeJumps += 1;
    else if (entry?.kind === 'bridge') bridgeJumps += 1;
    else if (entry?.kind === 'jump') driveJumps += 1;
  }
  return { holeJumps, bridgeJumps, driveJumps };
}

function hopsOf(rows: readonly Pick<RouteSafetyTripRow, 'entry' | 'systemId'>[]): JumpHop[] {
  return rows.flatMap((row, at): JumpHop[] => {
    if (at === 0 || !row.entry) return [];
    const from = rows[at - 1].systemId;
    return [
      row.entry.kind === 'jump'
        ? { kind: 'jump', from, to: row.systemId, distanceLy: row.entry.distanceLy }
        : { kind: 'gate', from, to: row.systemId },
    ];
  });
}

function stepReader(
  graph: JumpGraph,
  holes: readonly TheraConnection[],
  bridges: readonly AnsiblexGate[],
  positions: ReadonlyMap<number, SystemPosition> | null
): (systems: readonly number[]) => (RouteStep | null)[] {
  const stepOf = (from: number, to: number): RouteStep => {
    if (graph.get(from)?.includes(to)) return GATE_STEP;
    const hole = holeBetween(holes, from, to);
    if (hole) return { kind: 'hole', hole };
    const gate = bridgeBetween(bridges, from, to);
    if (gate) return { kind: 'bridge', gate };
    const a = positions?.get(from);
    const b = positions?.get(to);
    return a && b ? { kind: 'jump', distanceLy: lightYearDistance(a, b) } : GATE_STEP;
  };
  return (systems) =>
    systems.map((to, index) => (index === 0 ? null : stepOf(systems[index - 1], to)));
}

function sameRoute(a: readonly number[] | null, b: readonly number[] | null): boolean {
  return a !== null && b !== null && a.length === b.length && a.every((id, i) => id === b[i]);
}

export function assembleRouteSafety(input: RouteSafetyTripInput): RouteSafetyAssembly {
  const { planned, alternatives, pins, holes, listed, bridges, activity } = input;
  const { plan, graph } = planned;
  const listedById = new Map(listed?.map((hole) => [hole.id, hole]));
  const qualifyingIds = new Set(holes.map((hole) => hole.id));
  const pinnedHoles = alternatives.flatMap(({ pinned }) => {
    const hole =
      pinned?.kind === 'route' && pinned.hole ? listedById.get(pinned.hole.id) : undefined;
    return hole && !qualifyingIds.has(hole.id) ? [hole] : [];
  });
  const stepsOn = stepReader(
    graph,
    [...holes, ...pinnedHoles],
    bridges ?? [],
    input.jump?.positions ?? null
  );
  if (
    input.singleStop &&
    plan.legs[0]?.route.kind !== 'route' &&
    alternatives[0]?.pinned?.kind !== 'route'
  ) {
    return { kind: 'no-route' };
  }
  const inputs: RouteSafetyInputs = {
    systems: input.systems,
    regionNames: input.regionNames,
    kills: activity?.kills ?? null,
    jumps: activity?.jumps ?? null,
    lawless: input.lawless,
  };
  const tagRows = (systems: readonly number[]): RouteSafetyTripRow[] => {
    const steps = stepsOn(systems);
    return buildRouteSafetyRows(systems, inputs).map((row, at) => ({
      ...row,
      entry: steps[at] ?? null,
    }));
  };
  const summaryOf = (systems: readonly number[]) =>
    summarizeRouteSafety(buildRouteSafetyRows(systems, inputs));
  const jumpsOn = (systems: readonly number[]) => {
    const holeJumps: RouteSafetyWayHole[] = [];
    const bridgeJumps: RouteSafetyWayBridge[] = [];
    stepsOn(systems).forEach((step, at) => {
      const ends = { from: systems[at - 1], to: systems[at] };
      if (step?.kind === 'hole') holeJumps.push({ ...ends, hole: step.hole });
      else if (step?.kind === 'bridge') bridgeJumps.push({ ...ends, gate: step.gate });
    });
    return { holes: holeJumps, bridges: bridgeJumps };
  };
  const jumpOn = (rows: readonly Pick<RouteSafetyTripRow, 'entry' | 'systemId'>[]) => {
    const hops = hopsOf(rows);
    return input.jump && hops.some((hop) => hop.kind === 'jump')
      ? jumpWayFacts(hops, input.jump.drive)
      : null;
  };

  const legs = plan.legs.map((leg, index): RouteSafetyLeg => {
    const { ways, pinned } = alternatives[index] ?? { ways: [], pinned: null };
    const planner = leg.route.kind === 'route' ? leg.route.systems : null;
    const flown = pinned?.kind === 'route' ? pinned.systems : planner;
    const token = pins[index] ?? '';
    const pin = parseLegPin(token);
    let pinNote: LegPinNote | null = null;
    if (pin !== null && pinned === null && pinWaitsOnHoleList(pin) && listed === null) {
      pinNote = 'no-list';
    } else if (pinned !== null && pinned.kind !== 'route') {
      pinNote = pinned.kind;
    }

    const candidates: {
      kind: RouteSafetyWay['kind'];
      pin: string | null;
      systems: number[] | null;
    }[] = [];
    if (pinned?.kind === 'route' && pin?.kind === 'hole') {
      candidates.push({ kind: 'hole', pin: token, systems: pinned.systems });
    }
    if (pinned?.kind === 'route' && pin?.kind === 'hub') {
      candidates.push({ kind: pin.hub, pin: token, systems: pinned.systems });
    }
    for (const way of ways) {
      candidates.push({
        kind: way.way,
        pin: way.way,
        systems: way.route.kind === 'route' ? way.route.systems : null,
      });
    }
    const distinct = candidates.filter(
      (candidate, at) =>
        candidate.systems === null ||
        !candidates
          .slice(0, at)
          .some(
            (earlier) => earlier.kind !== 'hole' && sameRoute(earlier.systems, candidate.systems)
          )
    );
    if (planner !== null && !distinct.some((candidate) => sameRoute(candidate.systems, planner))) {
      distinct.unshift({ kind: 'planner', pin: null, systems: planner });
    }
    let inUseTaken = false;
    const listedWays = distinct.map((candidate): RouteSafetyWay => {
      const inUse = !inUseTaken && sameRoute(candidate.systems, flown);
      if (inUse) inUseTaken = true;
      return {
        kind: candidate.kind,
        pin: candidate.pin,
        summary: candidate.systems ? summaryOf(candidate.systems) : null,
        ...(candidate.systems ? jumpsOn(candidate.systems) : { holes: [], bridges: [] }),
        jump: candidate.systems ? jumpOn(tagRows(candidate.systems)) : null,
        inUse,
      };
    });
    const shownWays = [
      ...listedWays.filter((way) => way.inUse),
      ...listedWays.filter((way) => !way.inUse),
    ];

    const rows = flown === null ? null : tagRows(flown);
    return {
      from: leg.from,
      to: leg.to,
      rows,
      summary: rows === null ? null : summarizeRouteSafety(rows),
      ways: shownWays,
      pin: token,
      pinNote,
    };
  });

  const legRows = legs.flatMap((leg) => (leg.rows ? [leg.rows] : []));
  let tripFacts: RouteSafetyTrip | null = null;
  if (legRows.length === legs.length) {
    const joined = joinLegs(legRows);
    tripFacts = {
      rows: joined.rows,
      stopIndexes: joined.stopIndexes,
      summary: summarizeTrip(legRows),
      ...stepJumps(joined.rows),
      jump: jumpOn(joined.rows),
    };
  }
  return {
    kind: 'route',
    legs,
    trip: tripFacts,
    reordered: plan.reordered,
    unreachable: plan.unreachable,
    fetchedAt: activity?.fetchedAt ?? null,
    activityLoading: activity === null,
    activityUnavailable: activity !== null && (activity.kills === null || activity.jumps === null),
  };
}
